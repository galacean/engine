import type { FailureCategory, ExecutionSummary } from "./agent-failure";
import type { ModelRecoveryEvent } from "./model-recovery";
import type { AgentEditorComponentBinding } from "./agent-editor-facade";
import type { EditTransaction } from "@galacean/engine-project/edit-transaction";
import type { ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files";
import * as z from "zod";
import type { ModelTelemetry, ServerModelAttempt, ServerModelError } from "./context-metrics";
import type { ContextCompactionBudget, ContextCompactionResult } from "./context-compaction";
import type { AgentFileRead } from "./agent-file-read";
import type { ProjectFileSearchInput } from "@galacean/engine-project/project-files/project-file-search";

export type JsonSchema = Record<string, unknown>;

/** The complete JSON-shaped value algebra allowed to cross an Agent boundary. */
export type AgentValue =
  | null
  | boolean
  | number
  | string
  | readonly AgentValue[]
  | { readonly [key: string]: AgentValue };

export type AgentToolExecutionContext = {
  readonly signal: AbortSignal;
};

export type AgentToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    /** Provider-native JSON arguments. The application parses this at its boundary. */
    arguments: string;
  };
};

export type AgentModelToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
    strict: true;
  };
};

export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string; image?: AgentViewImage }
  | { role: "assistant"; content: string; toolCalls?: AgentToolCall[]; reasoningContent?: string }
  | { role: "tool"; toolCallId: string; content: string };

export type AgentViewImage = {
  blob: Blob;
  width: number;
  height: number;
};

export type AgentViewObservation = {
  /** Stable immutable image revision, when backed by a retained screenshot. */
  imagePath?: string;
  image: AgentViewImage;
  metadata: AgentValue;
};

export type AgentTool = {
  name: string;
  /** Omission means draft edit. Commands commit independently; sharing an execution does not make them part of draft rollback. */
  effect?: "read" | "edit" | "command";
  /** Host-only classification and compact identity. null denotes a pure query. */
  describeCommand?(input: AgentValue, result?: AgentToolResult): AgentCommandIdentity | null;
  parseInput(value: unknown): unknown;
  parseOutput(value: unknown): unknown;
  execute(input: unknown, context: AgentToolExecutionContext): Promise<unknown> | unknown;
};

export type AgentToolDefinition<TInputSchema extends z.ZodType, TOutputSchema extends z.ZodType> = {
  name: string;
  effect?: "read" | "edit" | "command";
  /** Host-only classification and compact identity. null denotes a pure query. */
  describeCommand?(input: AgentValue, result?: AgentToolResult): AgentCommandIdentity | null;
  /** Runtime boundary contract. The model reads AgentApplicationDefinition.scriptApi instead. */
  input: TInputSchema;
  /** Runtime result contract. API internals never cross the Agent Script boundary unvalidated. */
  output: TOutputSchema;
  execute(input: z.output<TInputSchema>, context: AgentToolExecutionContext): Promise<unknown> | unknown;
};

export function defineTool<TInputSchema extends z.ZodType, TOutputSchema extends z.ZodType>(
  definition: AgentToolDefinition<TInputSchema, TOutputSchema>
): AgentTool {
  return {
    name: definition.name,
    effect: definition.effect,
    describeCommand: definition.describeCommand,
    parseInput: (value) => parseToolValue(definition.input, value, `${definition.name} 输入`),
    parseOutput: (value) => parseToolValue(definition.output, value, `${definition.name} 输出`),
    execute: (input, context) => definition.execute(input as z.output<TInputSchema>, context)
  };
}

function parseToolValue<TSchema extends z.ZodType>(schema: TSchema, value: unknown, label: string): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.length ? `$.${issue.path.map(String).join(".")}` : "$";
      return `${path} ${issue.message}`;
    })
    .join("；");
  throw new Error(`${label}不符合 Schema${details ? `：${details}` : ""}`);
}

export type AgentApiSearchEntry = {
  /** Exact model-visible lookup key, for example `LakeAsset` or `water.create`. */
  name: string;
  /** One-line routing description used to generate the fixed prompt catalog. */
  description: string;
  /** Canonical declaration module that starts this entry's import closure. */
  moduleId: string;
};

export type AgentApiDeclarationModule = {
  /** Canonical POSIX-style path ending in `.d.ts`. */
  id: string;
  /** Complete generated TypeScript declaration module source. */
  source: string;
  /** Canonical imported module ids derived from this source by the declaration generator's TypeScript parser. */
  imports: readonly string[];
  /** Registered runtime APIs described by this declaration; reading does not grant permissions. */
  toolNames?: readonly string[];
};

/** Top-level host instructions, listed in every request and mounted read-only at skills/<name>/SKILL.md. */
export type AgentSkill = {
  name: string;
  description: string;
  content: string;
};

export type AgentScriptApiCatalog = {
  skills?: readonly AgentSkill[];
  /** Read-only sub-skills and references (skills/...) or API documents (declare/...), at their exact VFS paths. */
  documents?: readonly { path: string; content: string }[];
  /** Host facts every task needs, such as how APIs are namespaced. Not a routing list; Skills route intent. */
  hostNotes?: string;
  /** Exact model-visible entry symbols and their declaration module roots. */
  entries: readonly AgentApiSearchEntry[];
  /** Independent declaration modules resolved through their real TypeScript imports. */
  modules: readonly AgentApiDeclarationModule[];
};

/** Host-owned, read-only capabilities exposed directly to the model, outside editor transactions. */
export type AgentNativeReadTool = {
  readonly definition: AgentModelToolDefinition;
  invoke(input: Record<string, unknown>, context: AgentToolExecutionContext): Promise<unknown> | unknown;
};

export type AgentApplicationDefinition = {
  nativeReadTools?: readonly AgentNativeReadTool[];
  editorComponents?: readonly AgentEditorComponentBinding[];
  /** Root guide, read-only documents and the registered declaration capability graph. */
  scriptApi: AgentScriptApiCatalog;
  projectFiles?: readonly ProjectFileProvider[];
  /** Bounded historical runtime errors; does not trigger model requests. */
  runtimeDiagnostics?(): readonly { id: string; occurredAt: string; message: string }[];
  toolNames: readonly string[];
  provideWorldThumbnail?(): Promise<unknown> | unknown;
  /** Optional visual sensor. Only invoked by an explicit model Tool Call. */
  captureSnapshot?(signal: AbortSignal): Promise<AgentViewObservation>;
  imageResources?: import("./image-resources").ConversationImageResources;
  /** Opened only after execute preflight succeeds. Its tools exclusively read/write the draft. */
  beginEdit?(executionId: string, signal: AbortSignal): Promise<AgentEditTransaction> | AgentEditTransaction;
};

export interface AgentEditTransaction extends EditTransaction {
  /** Accept successful read-only session observations without publishing or saving a project. */
  completeRead?(): void;
  readonly tools: readonly AgentTool[];
  /** Host-only document operations; never exposed to execute scripts. */
  documents?: {
    read(path: string): Promise<string | undefined>;
    write(path: string, content: string): Promise<void>;
    delete(path: string): Promise<void>;
  };
}

export type AgentCommandIdentity = Readonly<{
  commandId?: string;
  scopeId?: string;
  revision?: number;
  replayed?: boolean;
}>;

export type AgentCommandReceipt = AgentCommandIdentity &
  Readonly<{
    call: number;
    tool: string;
    status: "settled" | "unknown";
    ok?: boolean;
    errorCode?: string;
  }>;

export type AgentExecutionReceipt = Readonly<{
  executionId: string;
  status: "rejected" | "aborted" | "committed" | "publication_failed" | "completed" | "interrupted";
  /** Independent calls retain their own outcomes; interrupted scripts never imply rollback. */
  commands?: readonly AgentCommandReceipt[];
  transactionId?: string;
  revision?: number;
  /** When author data was committed, before activation. It does not prove a screenshot shows the edit; check runtimeErrors. */
  committedAt?: string;
  runtimeErrors?: readonly string[];
}>;

export type AgentScriptDecision = {
  type: "execute";
  code: string;
};

export type AgentReadDecision = AgentFileRead & { type: "read_tool" };

export type AgentListDecision = { type: "list_tool"; path: string; query?: string; offset: number; limit: number };
export type AgentSearchDecision = ProjectFileSearchInput & { type: "search_tool" };

export type AgentFinalDecision = {
  type: "final";
  message: string;
};

export type AgentPickDecision = { type: "pick"; input: import("./agent-snapshots").SnapshotPickInput };
export type AgentFileToolName = "read" | "write" | "edit" | "delete" | "glob" | "grep";
export type AgentFileDecision = { type: "file"; name: AgentFileToolName; input: Record<string, unknown> };
export type AgentInvalidToolDecision = { type: "invalid_tool"; name: string; message: string };
export type AgentNativeReadDecision = { type: "native_read"; name: string; input: Record<string, unknown> };
export type AgentDecision =
  | AgentNativeReadDecision
  | AgentFileDecision
  | AgentInvalidToolDecision
  | AgentReadDecision
  | AgentListDecision
  | AgentSearchDecision
  | AgentScriptDecision
  | AgentFinalDecision
  | { type: "snapshot" }
  | AgentPickDecision;

export type AgentToolErrorCode = "UNKNOWN_TOOL" | "INVALID_ARGUMENTS" | "TOOL_EXECUTION_FAILED" | "INVALID_TOOL_RESULT";

export type AgentToolError = {
  /** Framework or application error code. Application Tool codes form an open set. */
  code: string;
  message: string;
  retryable?: boolean;
  /** True when the failing Tool may already have changed application state. */
  executed?: boolean;
  /** The application has a definitive result, including any committed side effects. Never set for an ambiguous failure. */
  outcomeKnown?: boolean;
  details?: AgentValue;
  /** Original implementation stack retained by diagnostics and never sent to the model. */
  stack?: string;
};

/**
 * A structured application failure that crosses the Tool boundary without being
 * mistaken for a successful Tool value.
 */
export class AgentToolExecutionError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly executed: boolean;
  readonly outcomeKnown: boolean;
  readonly details?: unknown;

  constructor(input: {
    code: string;
    message: string;
    retryable?: boolean;
    executed?: boolean;
    outcomeKnown?: boolean;
    details?: unknown;
    stack?: string;
  }) {
    super(input.message);
    this.name = "AgentToolExecutionError";
    if (input.stack) this.stack = input.stack;
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.executed = input.executed ?? false;
    this.outcomeKnown = input.outcomeKnown ?? false;
    this.details = input.details;
  }
}

export type AgentToolResult = { ok: true; value: AgentValue } | { ok: false; error: AgentToolError };

export type AgentScriptErrorPhase =
  | "search"
  | "parse"
  | "check"
  | "execution"
  | "tool"
  | "output"
  | "build"
  | "prepare"
  | "publish"
  | "timeout"
  | "cancelled";

export type AgentScriptLocation =
  | Readonly<{ source: "execute.code" }>
  | Readonly<{ source: "execute.code"; line: number; column: number }>
  | Readonly<{ source: "execute.code"; target: "return" }>;

export type AgentScriptExecutionEvidence = {
  status: "tool_calls_completed_before_failure";
  successfulToolCalls: readonly Readonly<{
    call: number;
    tool: string;
    result: AgentValue;
  }>[];
  successfulToolCallsTruncated: boolean;
  failedToolMayHaveExecuted: boolean;
};

export type AgentScriptError = {
  /** Framework or application Tool error code. */
  code: string;
  phase: AgentScriptErrorPhase;
  message: string;
  /** Model-facing location within the paired execute.code source when it can be identified. */
  location?: AgentScriptLocation;
  tool?: string;
  retryable?: boolean;
  details?: AgentValue;
  execution?: AgentScriptExecutionEvidence;
};

export type AgentConsoleEntry = { level: "log" | "info" | "warn" | "error" | "debug"; args: AgentValue[] };
type AgentOutputDisplay = { console?: AgentConsoleEntry[]; returnValuePresent?: boolean; outputFile?: string };

/** Logs and the final return value have separate identities. */
export type AgentScriptResult = AgentOutputDisplay &
  (
    | { ok: true; output: AgentValue; receipt?: AgentExecutionReceipt }
    | { ok: false; error: AgentScriptError; receipt?: AgentExecutionReceipt }
  );

/** One detailed API call retained by diagnostics, never by the model transcript. */
export type AgentScriptToolTrace = {
  call: number;
  tool: string;
  input: AgentValue;
  result: AgentToolResult;
  durationMilliseconds: number;
};

/** Complete per-call diagnostics. This is deliberately separate from AgentScriptResult. */
export type AgentScriptTrace = {
  callId: string;
  source: string;
  startedAt: string;
  durationMilliseconds: number;
  toolCalls: AgentScriptToolTrace[];
  logs: string[];
  result: AgentScriptResult;
  errorStack?: string;
};

export type AgentScriptToolBinding = {
  name: string;
  effect?: "read" | "edit" | "command";
  /** Host-only classification and compact identity. null denotes a pure query. */
  describeCommand?(input: AgentValue, result?: AgentToolResult): AgentCommandIdentity | null;
  /** Execution-local ordinal, shared with AgentScriptToolTrace.call; optional for older runtimes. */
  invoke(input: AgentValue, signal: AbortSignal, call?: number): Promise<AgentToolResult>;
};

export type AgentScriptCall = {
  editorComponents?: readonly AgentEditorComponentBinding[];
  id: string;
  source: string;
  toolBindings: readonly AgentScriptToolBinding[];
  signal: AbortSignal;
  maxToolCalls: number;
  timeoutMs: number;
  onTrace?(trace: AgentScriptTrace): void;
};

export interface AgentScriptRuntime {
  execute(call: AgentScriptCall): Promise<AgentScriptResult>;
}

export type AgentModelDebug = {
  validationStatus?: "valid" | "invalid";
  validationError?: string | null;
  modelName?: string;
  requestedModel?: string;
  artifactId?: string;
  modelRoute?: string;
  jsonSchemaName?: string;
  structuredOutputMode?: string;
  finishReason?: AgentFinishReason;
};

export type AgentModelAttempt = {
  category?: FailureCategory;
  attempt: number;
  rawContent: string;
  error: string | null;
  errorCode?: string;
  errorDetails?: ServerModelError["details"];
  modelAttempts?: ServerModelAttempt[];
  finishReason?: AgentFinishReason;
  toolCalls?: AgentToolCall[];
  traceId?: string;
  debug?: AgentModelDebug;
  /** Present only when Agent debug tracing is enabled. */
  requestMessages?: AgentMessage[];
  durationMilliseconds?: number;
  telemetry?: ModelTelemetry;
  contextCompaction?: ContextCompactionResult;
};

export type AgentStepRecord = {
  step: number;
  /** First step of the model response owning this call. */
  modelStep?: number;
  decision: AgentDecision;
  toolCallId?: string;
  attempts: AgentModelAttempt[];
  /** Exact Agent Script API surface available to this step. */
  availableApiNames?: string[];
  scriptResult?: AgentScriptResult;
};

export type AgentInputSource = "text" | "voice";

export type AgentInputTarget = "next-step" | "next-turn";
export type AgentUserInput = {
  visualReferences?: import("./agent-image-store").AgentImageReference[];
  id: string;
  text: string;
  inputSource: AgentInputSource;
  context?: AgentValue;
};
export type AgentSessionState = "idle" | "preparing" | "executing" | "stopping" | "stopped" | "disposed";

/** In-memory recovery evidence, never an executable script checkpoint. */
export type AgentContinuation = {
  visualReferences?: import("./agent-image-store").AgentImageReference[];
  taskId: string;
  transcript: AgentMessage[];
  inputs: AgentUserInput[];
  stageResults: AgentScriptResult[];
  nextStep: number;
};

export type AgentRunControl = {
  initialInputId?: string;
  continuation?: AgentContinuation;
  takeInputs():
    | (AgentUserInput & { attachments?: readonly AgentViewObservation[] })[]
    | Promise<(AgentUserInput & { attachments?: readonly AgentViewObservation[] })[]>;
  hasPendingInputs(): boolean;
  saveContinuation(value: AgentContinuation): void;
};

export type AgentRunOptions = {
  /** Explicit diagnostic budgets only; omitted values use ASAP's production defaults. */
  contextCompaction?: ContextCompactionBudget;
  /** User-supplied visual references, frozen for the entire task. */
  attachments?: readonly AgentViewObservation[];
  /** Application reference data captured once per task; never interpreted as instructions. */
  context?: AgentValue;
  /** Optional ASAP model route alias. Applications may pin this to one model. */
  model?: string;
  debugMode?: boolean;
  /** Identifies whether user input is authored text or a potentially noisy ASR transcript. */
  inputSource?: AgentInputSource;
};

export type AgentTaskOutcome =
  | {
      status: "completed";
      message: string;
      output: AgentValue;
      /** Host outcomes survive task-level observation, model or cancellation failures. */
      executions?: readonly AgentExecutionReceipt[];
    }
  | {
      status: "failed" | "cancelled";
      message: string;
      executions?: readonly AgentExecutionReceipt[];
    };

export type AgentTaskResult = {
  visualReferences?: import("./agent-image-store").AgentImageReference[];
  taskId: string;
  input: string;
  inputSource: AgentInputSource;
  inputs?: AgentUserInput[];
  finalMessage: string;
  result: Extract<AgentTaskOutcome, { status: "completed" }>;
  stageResults: AgentScriptResult[];
  steps: AgentStepRecord[];
};

export type AgentTaskFailure = {
  category?: FailureCategory;
  executionSummary?: ExecutionSummary;
  visualReferences?: import("./agent-image-store").AgentImageReference[];
  taskId: string;
  input: string;
  inputSource: AgentInputSource;
  inputs?: AgentUserInput[];
  status: "failed" | "cancelled";
  message: string;
  result: Extract<AgentTaskOutcome, { status: "failed" | "cancelled" }>;
  stageResults: AgentScriptResult[];
  steps: AgentStepRecord[];
};

export type AgentEvent =
  | {
      type: "input_attachments";
      taskId: string;
      inputId?: string;
      images: { reference: import("./agent-image-store").AgentImageReference; image: AgentViewImage }[];
    }
  | { type: "session_state"; state: AgentSessionState; canContinue: boolean }
  | { type: "input_queued"; input: AgentUserInput; target: AgentInputTarget }
  | { type: "input_consumed"; input: AgentUserInput; taskId: string }
  | { type: "input_removed"; inputId: string }
  | {
      type: "task_started";
      taskId: string;
      input: string;
      inputSource: AgentInputSource;
      context?: AgentValue;
      continuedFrom?: string;
      inputId?: string;
    }
  | { type: "transcript_appended"; taskId: string; messages: AgentMessage[] }
  | {
      type: "image_resources";
      taskId: string;
      action: "captured" | "read" | "released";
      imagePath?: string;
      storedCount: number;
      storedBytes: number;
      offloadedCount: number;
      resources?: AgentValue;
    }
  | { type: "model_recovery"; taskId: string; step: number; attempt: number; recovery: ModelRecoveryEvent }
  | { type: "model_started"; taskId: string; step: number; availableApiNames?: string[] }
  | {
      type: "model_request";
      taskId: string;
      step: number;
      attempt: number;
      messages: AgentMessage[];
      tools?: AgentModelToolDefinition[];
    }
  | { type: "model_finished"; taskId: string; step: AgentStepRecord }
  | {
      type: "view_observed";
      taskId: string;
      step: number;
      toolCallId: string;
      image: AgentViewImage;
      metadata: AgentValue;
    }
  | { type: "model_failed"; taskId: string; step: number; attempts: AgentModelAttempt[]; error: Error }
  | { type: "script_started"; taskId: string; step: number; code: string }
  | { type: "script_finished"; taskId: string; step: number; result: AgentScriptResult }
  | { type: "script_trace"; taskId: string; step: number; trace: AgentScriptTrace }
  | {
      type: "tool_started";
      taskId: string;
      step: number;
      call?: number;
      toolCallId?: string;
      tool: string;
      input: AgentValue;
    }
  | {
      type: "tool_finished";
      taskId: string;
      step: number;
      call?: number;
      toolCallId?: string;
      tool: string;
      result: AgentToolResult;
      receipt?: AgentExecutionReceipt;
    }
  | { type: "task_completed"; taskId: string; result: AgentTaskResult }
  | {
      type: "task_failed";
      taskId: string;
      error: Error;
      failure: AgentTaskFailure;
      steps: AgentStepRecord[];
    };

export type AgentEventListener = (event: AgentEvent) => void;

export type AgentConfiguration = {
  definition: AgentApplicationDefinition;
  tools: readonly AgentTool[];
};
export type AgentLoopOptions = AgentConfiguration & {
  /** Sampled between model steps. Return stable references until capabilities change. */
  getConfiguration?: () => AgentConfiguration;
  scriptRuntime?: AgentScriptRuntime;
  scriptChecker?: import("./agent-worker-checker").AgentScriptChecker;
  /** Maximum model responses allowed while correcting one invalid response. */
  maxModelAttempts?: number;
  /** Consecutive model response rounds with script/argument errors; Tool execution failures do not consume this budget. */
  maxScriptRepairs?: number;
  /** Total model response rounds with Tool execution/output failures, including rounds with other successful calls. */
  maxToolFailureRounds?: number;
  /**
   * Maximum consecutive successful executions allowed for the exact same script
   * and exact same model-visible output. Reaching the limit means the task is no
   * longer gaining information and must stop instead of replaying side effects.
   */
  maxConsecutiveNoProgressScripts?: number;
  maxToolCallsPerScript?: number;
  /** Total host calls across all execute scripts in one task; retries do not reset it. */
  maxToolCallsPerTask?: number;
  scriptTimeoutMs?: number;
};

export type AgentFinishReason = "stop" | "tool_calls" | "length" | "content_filter";
