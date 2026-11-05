import { classifyFailure, summarizeExecutions, describeTaskFailure } from "./agent-failure";
import { MODEL_ROUND_TIMEOUT_MS, type ModelRecoveryEvent } from "./model-recovery";
import { createAgentEditorFacade } from "./agent-editor-facade";
import { createAgentProjectFiles, projectDeclarationModules } from "./agent-project-files";
import { AgentOutputFiles } from "./agent-file-api";
import { AgentNativeFiles, isParallelFileTool, nativeFileTraceInput } from "./agent-native-files";
import { runToolBatch } from "./agent-tool-batch";
import { fileToolStepResult, presentScriptOutput } from "./agent-output";
import { AgentImageStore, AgentImageStorageLimitError } from "./agent-image-store";
import { withoutReasoningContent } from "./agent-message-state";
import {
  buildAgentMessages,
  buildAgentSystemPrompt,
  buildAgentToolDefinitions,
  parseAgentFinalMessage,
  parseAgentToolCall
} from "./agent-protocol";
import { extractAgentScriptToolReferences } from "./agent-script-runtime";
import { WorkerAgentScriptRuntime } from "./agent-worker-runtime";
import { WorkerAgentScriptChecker, type AgentScriptChecker } from "./agent-worker-checker";
import { executeAgentEdit } from "./agent-edit-execution";
import { requestAsapChat, type AsapModelError } from "./asap-chat";
import {
  AgentContextTranscript,
  createContextCompactionRequest,
  type ContextCompactionRequest
} from "./context-compaction";
import { EMPTY_CONVERSATION_HISTORY, type ConversationHistorySnapshot } from "./conversation-history";
import { AgentValueError, toAgentToolOutput, toAgentValue } from "./agent-values";
import { ToolRegistry } from "./tool-registry";
import { AgentToolExecutionError } from "./agent-types";
import type {
  AgentDecision,
  AgentExecutionReceipt,
  AgentEvent,
  AgentEventListener,
  AgentLoopOptions,
  AgentModelAttempt,
  AgentRunOptions,
  AgentRunControl,
  AgentUserInput,
  AgentViewObservation,
  AgentViewImage,
  AgentScriptExecutionEvidence,
  AgentScriptLocation,
  AgentScriptResult,
  AgentScriptRuntime,
  AgentStepRecord,
  AgentTaskFailure,
  AgentTaskResult,
  AgentTool,
  AgentToolResult,
  AgentValue,
  AgentMessage,
  AgentModelToolDefinition
} from "./agent-types";

const DEFAULT_MAX_MODEL_ATTEMPTS = 3;
const DEFAULT_MAX_SCRIPT_REPAIRS = 3;
const DEFAULT_MAX_TOOL_FAILURE_ROUNDS = 3;
const DEFAULT_MAX_CONSECUTIVE_NO_PROGRESS_SCRIPTS = 2;
const DEFAULT_MAX_TOOL_CALLS_PER_SCRIPT = 50;
const DEFAULT_MAX_TOOL_CALLS_PER_TASK = 256;
const DEFAULT_SCRIPT_TIMEOUT_MS = 30_000;
const taskFailures = new WeakMap<Error, AgentTaskFailure>();

type ModelTurnResult = {
  decision: AgentDecision;
  calls?: { decision: AgentDecision; toolCallId: string }[];
  toolCallId?: string;
  assistantMessage: Extract<AgentMessage, { role: "assistant" }>;
  attempts: AgentModelAttempt[];
};

type ModelToolResult = {
  console?: import("./agent-types").AgentConsoleEntry[];
  returnValuePresent?: boolean;
  outputFile?: string;
  receipt?: import("./agent-types").AgentExecutionReceipt;
} & (
  | { ok: true; result: AgentValue }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        retryable?: boolean;
        details?: AgentValue;
      };
      execution?: AgentScriptExecutionEvidence;
    }
  | {
      ok: false;
      error: string;
      code: string;
      phase: import("./agent-types").AgentScriptErrorPhase;
      tool?: string;
      retryable?: boolean;
      location?: AgentScriptLocation;
      details?: AgentValue;
      execution?: AgentScriptExecutionEvidence;
    }
);

export class AgentLoop {
  #definition: AgentLoopOptions["definition"];
  #tools: readonly AgentTool[];
  #toolRegistry: ToolRegistry;
  readonly #getConfiguration: AgentLoopOptions["getConfiguration"];
  #configuredTools: readonly AgentTool[];
  readonly #scriptRuntime: AgentScriptRuntime;
  readonly #scriptChecker: AgentScriptChecker;
  readonly #maxModelAttempts: number;
  readonly #maxScriptRepairs: number;
  readonly #maxToolFailureRounds: number;
  readonly #maxConsecutiveNoProgressScripts: number;
  readonly #maxToolCallsPerScript: number;
  readonly #maxToolCallsPerTask: number;
  readonly #scriptTimeoutMs: number;
  readonly #listeners = new Set<AgentEventListener>();
  readonly #outputFiles = new AgentOutputFiles();
  readonly #fileObservations = new Map<string, string>();
  #activeTaskId: string | null = null;
  #controller: AbortController | null = null;

  resetKnowledge(): void {
    if (this.running) throw new AgentBusyError();
    this.#scriptChecker.dispose?.();
    this.#outputFiles.clear();
    this.#fileObservations.clear();
  }

  constructor(options: AgentLoopOptions) {
    this.#getConfiguration = options.getConfiguration;
    this.#configuredTools = options.tools;
    this.#definition = options.definition;
    this.#toolRegistry = new ToolRegistry(options.tools);
    this.#tools = this.#toolRegistry.select(options.definition.toolNames);
    validateScriptApiCoverage(options.definition, this.#tools);
    this.#scriptRuntime = options.scriptRuntime ?? new WorkerAgentScriptRuntime();
    this.#scriptChecker = options.scriptChecker ?? new WorkerAgentScriptChecker();
    this.#maxModelAttempts = requirePositiveInteger(
      options.maxModelAttempts ?? DEFAULT_MAX_MODEL_ATTEMPTS,
      "maxModelAttempts"
    );
    this.#maxScriptRepairs = requirePositiveInteger(
      options.maxScriptRepairs ?? DEFAULT_MAX_SCRIPT_REPAIRS,
      "maxScriptRepairs"
    );
    this.#maxToolFailureRounds = requirePositiveInteger(
      options.maxToolFailureRounds ?? DEFAULT_MAX_TOOL_FAILURE_ROUNDS,
      "maxToolFailureRounds"
    );
    this.#maxConsecutiveNoProgressScripts = requirePositiveInteger(
      options.maxConsecutiveNoProgressScripts ?? DEFAULT_MAX_CONSECUTIVE_NO_PROGRESS_SCRIPTS,
      "maxConsecutiveNoProgressScripts"
    );
    this.#maxToolCallsPerScript = requirePositiveInteger(
      options.maxToolCallsPerScript ?? DEFAULT_MAX_TOOL_CALLS_PER_SCRIPT,
      "maxToolCallsPerScript"
    );
    this.#maxToolCallsPerTask = requirePositiveInteger(
      options.maxToolCallsPerTask ?? DEFAULT_MAX_TOOL_CALLS_PER_TASK,
      "maxToolCallsPerTask"
    );
    this.#scriptTimeoutMs = requirePositiveInteger(
      options.scriptTimeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS,
      "scriptTimeoutMs"
    );
  }

  #refreshConfiguration(): boolean {
    const next = this.#getConfiguration?.();
    if (!next || (next.definition === this.#definition && next.tools === this.#configuredTools)) return false;
    const registry = new ToolRegistry(next.tools);
    const tools = registry.select(next.definition.toolNames);
    validateScriptApiCoverage(next.definition, tools);
    this.#definition = next.definition;
    this.#configuredTools = next.tools;
    this.#toolRegistry = registry;
    this.#tools = tools;
    return true;
  }

  get running(): boolean {
    return this.#activeTaskId !== null;
  }

  subscribe(listener: AgentEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  cancel(): void {
    this.#controller?.abort();
    this.#scriptChecker.dispose?.();
  }

  beginConversationTurn(turn: number): void {
    this.#definition.imageResources?.beginTurn(turn);
  }
  resetConversationImages(): void {
    this.#definition.imageResources?.resetConversation();
  }

  async run(
    input: string,
    options: AgentRunOptions,
    conversationHistory: ConversationHistorySnapshot = EMPTY_CONVERSATION_HISTORY,
    control?: AgentRunControl
  ): Promise<AgentTaskResult> {
    const userInput = input.trim();
    const inputSource = options.inputSource ?? "text";
    if (!userInput) throw new Error("Agent task input cannot be empty");
    const model = options.model?.trim();
    if (options.model !== undefined && !model) throw new Error("ASAP model cannot be empty");
    if (this.running) throw new AgentBusyError();

    const contextCompaction = createContextCompactionRequest(options.contextCompaction);
    const taskContext = options.context === undefined ? undefined : structuredClone(toAgentValue(options.context));
    const taskId = crypto.randomUUID();
    const controller = new AbortController();
    let modelFailed = false;
    const stageResults: AgentScriptResult[] = structuredClone(control?.continuation?.stageResults ?? []);
    const inputs: AgentUserInput[] = structuredClone(control?.continuation?.inputs ?? []);
    const steps: AgentStepRecord[] = [];
    this.#refreshConfiguration();
    const transcript = new AgentContextTranscript();
    const historyReferences = [
      ...(control?.continuation?.visualReferences ?? []),
      ...inputs.flatMap((input) => input.visualReferences ?? []),
      ...conversationHistory.flatMap((record) => [
        ...(record.visualReferences ?? []),
        ...(record.inputs ?? []).flatMap((input) => input.visualReferences ?? [])
      ])
    ];
    const images = new AgentImageStore(this.#definition.imageResources, historyReferences);
    const visualReferences: import("./agent-image-store").AgentImageReference[] = structuredClone(
      control?.continuation?.visualReferences ?? []
    );
    let imagesReleased = false;
    const reportImages = (action: "captured" | "read" | "released", offloadedCount = 0, imageId?: string) => {
      if (options.debugMode)
        this.#emit({
          type: "image_resources",
          taskId,
          action,
          imageId,
          storedCount: images.size,
          storedBytes: images.bytes,
          pointerCount: images.pointerCount,
          pointerBytes: images.pointerBytes,
          resources: this.#definition.imageResources?.diagnostics ?? toAgentValue(images.budget.stats),
          offloadedCount
        });
    };
    const releaseImages = () => {
      if (imagesReleased) return;
      imagesReleased = true;
      images.dispose();
      transcript.releaseImages();
      reportImages("released");
    };
    controller.signal.addEventListener("abort", releaseImages, { once: true });
    const appendTranscript = (...messages: AgentMessage[]) => {
      if (!messages.length) return;
      transcript.push(...messages);
      if (options.debugMode)
        this.#emit({ type: "transcript_appended", taskId, messages: redactMessageImages(messages) });
    };
    const appendAttachments = (attachments: readonly AgentViewObservation[] = [], inputId?: string) => {
      const recorded: { reference: import("./agent-image-store").AgentImageReference; image: AgentViewImage }[] = [];
      const references: import("./agent-image-store").AgentImageReference[] = [];
      for (const [index, attachment] of attachments.entries()) {
        const saved = images.save({ ...attachment, metadata: toAgentValue(attachment.metadata) });
        references.push(saved.reference);
        recorded.push({ reference: saved.reference, image: saved.image });
        appendTranscript({
          role: "user",
          content: JSON.stringify({
            contextKind: "user_visual_reference",
            ...saved.reference,
            inputId,
            photoNumber: index + 1,
            photoCount: attachments.length,
            metadata: saved.metadata
          }),
          image: saved.image
        });
        reportImages("captured", transcript.offloadImages(), saved.reference.imageId);
      }
      if (recorded.length && options.debugMode)
        this.#emit({ type: "input_attachments", taskId, inputId, images: recorded });
      return references;
    };
    const reportedRuntimeErrors = new Set<string>();
    const outputFiles = this.#outputFiles;
    if (!control?.continuation) {
      outputFiles.clear();
      this.#fileObservations.clear();
    }
    let executeSource = "";
    const fileCatalog = () => this.#definition.scriptApi;
    const makeProjectFiles = (providers = this.#definition.projectFiles ?? []) =>
      createAgentProjectFiles(fileCatalog(), [
        ...providers,
        outputFiles.provider,
        {
          paths: () => ["editor/execute.js"],
          read: (path) => (path === "editor/execute.js" ? executeSource : undefined)
        }
      ]);
    let projectFiles = makeProjectFiles();
    let modelTools = buildAgentToolDefinitions(this.#definition);
    let fileOutputOrdinal = 0;
    const fileTools = new AgentNativeFiles(
      () => makeProjectFiles(),
      () => this.#definition,
      this.#fileObservations,
      (content) => outputFiles.save(`${taskId}:files:${++fileOutputOrdinal}`, content)
    );
    let consecutiveScriptFailures = 0;
    let toolFailureRounds = 0;
    let consecutiveInvalidBatches = 0;
    let taskToolCalls = 0;
    let taskBudgetExceeded = false;
    let previousSuccessfulScriptSignature: string | undefined;
    let consecutiveNoProgressScripts = 0;
    this.#activeTaskId = taskId;
    this.#controller = controller;
    this.#emit({
      type: "task_started",
      taskId,
      input: userInput,
      inputSource,
      context: control?.continuation?.inputs.at(-1)?.context ?? taskContext,
      continuedFrom: control?.continuation?.taskId
    });
    appendTranscript(...(control?.continuation?.transcript ?? []));
    if (control?.continuation)
      appendTranscript({
        role: "user",
        content: JSON.stringify({
          contextKind: "task_continued",
          message:
            "用户要求继续被中断的任务。已提交操作仍然有效；结合执行回执和当前状态完成剩余目标，不重复已提交的操作；未完成步骤可重新规划。历史图片引用仍保留；使用 read_image 读取尚未过期的图片，过期时重新观察。"
        })
      });

    try {
      if (!control?.continuation)
        visualReferences.push(...appendAttachments(options.attachments, control?.initialInputId));
      modelTools = buildAgentToolDefinitions(this.#definition, images.size > 0);
      for (let stepNumber = control?.continuation?.nextStep ?? 1; ; stepNumber += 1) {
        throwIfAborted(controller.signal);
        const additions = (await control?.takeInputs()) ?? [];
        for (const { attachments, ...addition } of additions) {
          if (attachments?.length) addition.visualReferences = appendAttachments(attachments, addition.id);
          if (attachments?.length) modelTools = buildAgentToolDefinitions(this.#definition, images.size > 0);
          inputs.push(addition);
          appendTranscript({ role: "user", content: JSON.stringify({ contextKind: "user_input", ...addition }) });
          this.#emit({ type: "input_consumed", taskId, input: structuredClone(addition) });
        }
        throwIfAborted(controller.signal);
        if (this.#refreshConfiguration()) {
          projectFiles = makeProjectFiles();
          modelTools = buildAgentToolDefinitions(this.#definition, images.size > 0);
          appendTranscript({
            role: "user",
            content: JSON.stringify({
              contextKind: "capabilities_changed",
              message:
                "项目的可用接口已更新。之前读取的声明仅代表历史版本；请重新 read editor/README.md 和相关声明后继续。"
            })
          });
        }
        const worldThumbnail = await this.#provideWorldThumbnail();
        throwIfAborted(controller.signal);
        const availableTools = this.#tools;
        const availableApiNames = availableTools.map((tool) => tool.name);
        this.#emit({ type: "model_started", taskId, step: stepNumber, availableApiNames });
        const systemPrompt = buildAgentSystemPrompt(this.#definition);
        const runtimeErrors = (this.#definition.runtimeDiagnostics?.() ?? []).filter(
          (error) => !reportedRuntimeErrors.has(error.id)
        );
        if (runtimeErrors.length) {
          appendTranscript({
            role: "user",
            content: JSON.stringify({ contextKind: "runtime_errors", historical: true, errors: runtimeErrors })
          });
          for (const error of runtimeErrors) reportedRuntimeErrors.add(error.id);
        }

        let decisionResult: ModelTurnResult;
        try {
          decisionResult = await this.#requestModelTurn({
            taskId,
            step: stepNumber,
            userInput,
            inputSource,
            taskContext,
            inputs,
            conversationHistory,
            worldThumbnail,
            transcript,
            images,
            contextCompaction,
            systemPrompt,
            tools: modelTools,
            model,
            debugMode: Boolean(options.debugMode),
            signal: controller.signal
          });
        } catch (error) {
          modelFailed = true;
          const requestFailure = error instanceof AgentModelRequestFailure ? error : undefined;
          const normalizedError = requestFailure?.requestError ?? normalizeError(error);
          const attempts = requestFailure?.attempts ?? (error instanceof AgentDecisionError ? error.attempts : []);
          this.#emit({
            type: "model_failed",
            taskId,
            step: stepNumber,
            attempts,
            error: normalizedError
          });
          throw normalizedError;
        }

        appendTranscript(decisionResult.assistantMessage);
        const batchStep = stepNumber;
        const calls = decisionResult.calls ?? [
          { decision: decisionResult.decision, toolCallId: decisionResult.toolCallId }
        ];
        const messagesByCall: AgentMessage[][] = calls.map(() => []);
        // Model call IDs may repeat across turns; admission belongs to this batch slot.
        const startedCalls = new Set<number>();
        let batchScriptFailure: string | undefined;
        let batchToolFailure: string | undefined;
        let batchScriptSucceeded = false;
        const executeCall = async (
          call: (typeof calls)[number],
          callIndex: number
        ): Promise<AgentTaskResult | void> => {
          startedCalls.add(callIndex);
          const decisionResult = { ...call, attempts: callIndex === 0 ? decisionResultOriginal.attempts : [] };
          const stepNumber = batchStep + callIndex;
          const appendCallMessages = (...messages: AgentMessage[]) => {
            messagesByCall[callIndex].push(...messages);
          };
          const step: AgentStepRecord = {
            step: stepNumber,
            decision: decisionResult.decision,
            ...(decisionResult.toolCallId ? { toolCallId: decisionResult.toolCallId } : {}),
            attempts: callIndex === 0 ? decisionResult.attempts : [],
            modelStep: batchStep,
            availableApiNames
          };
          steps.push(step);
          this.#emit({ type: "model_finished", taskId, step: cloneStep(step) });

          if (decisionResult.decision.type === "invalid_tool") {
            if (taskToolCalls++ >= this.#maxToolCallsPerTask)
              throw new AgentTaskToolLimitError(this.#maxToolCallsPerTask);
            const result: AgentToolResult = {
              ok: false,
              error: { code: "INVALID_TOOL_CALL", message: decisionResult.decision.message }
            };
            await this.#observeToolCall(
              {
                taskId,
                step: stepNumber,
                call: 1,
                toolCallId: decisionResult.toolCallId,
                tool: decisionResult.decision.name
              },
              null,
              controller.signal,
              async () => ({ result })
            );
            appendCallMessages(toolResultMessage(decisionResult.toolCallId!, result));
            return;
          }
          if (decisionResult.decision.type === "file") {
            if (taskToolCalls >= this.#maxToolCallsPerTask)
              throw new AgentTaskToolLimitError(this.#maxToolCallsPerTask);
            taskToolCalls++;
            const { name, input } = decisionResult.decision;
            const outcome = await this.#observeToolCall(
              { taskId, step: stepNumber, call: 1, toolCallId: decisionResult.toolCallId, tool: name },
              nativeFileTraceInput(input),
              controller.signal,
              () => fileTools.execute(name, input, `${taskId}:${stepNumber}`, controller.signal)
            );
            appendCallMessages({ role: "tool", toolCallId: decisionResult.toolCallId!, content: outcome.content });
            const result = fileToolStepResult(outcome);
            stageResults.push(result);
            step.scriptResult = structuredClone(result);
            if (outcome.receipt?.status === "publication_failed")
              throw new Error("File publication outcome is uncertain; inspect the receipt before retrying");
            throwIfAborted(controller.signal);
            return;
          }

          if (decisionResult.decision.type === "pointer") {
            const { imageId, x, y } = decisionResult.decision;
            const outcome = await this.#observeToolCall(
              { taskId, step: stepNumber, call: 1, toolCallId: decisionResult.toolCallId, tool: "pointer" },
              { imageId, x, y },
              controller.signal,
              async (): Promise<{ result: AgentToolResult }> => {
                try {
                  if (!this.#definition.supportsViewPointer) throw new Error("Pointer observation is unavailable");
                  return {
                    result: {
                      ok: true,
                      value: { imageId, x, y, observation: toAgentValue(images.point(imageId, x, y)) }
                    }
                  };
                } catch (error) {
                  return {
                    result: {
                      ok: false,
                      error: {
                        code:
                          typeof (error as { code?: unknown })?.code === "string"
                            ? (error as { code: string }).code
                            : "POINTER_FAILED",
                        message: getErrorMessage(error, "Pointer observation failed")
                      }
                    }
                  };
                }
              }
            );
            appendCallMessages(
              toolResultMessage(
                decisionResult.toolCallId!,
                outcome.result.ok ? { ok: true, result: outcome.result.value } : outcome.result
              )
            );
            return;
          }
          if (decisionResult.decision.type === "observe_view" || decisionResult.decision.type === "read_image") {
            const decision = decisionResult.decision;
            const capturing = decision.type === "observe_view";
            let saved: ReturnType<AgentImageStore["read"]> | undefined;
            let fatalError: unknown;
            const outcome = await this.#observeToolCall(
              { taskId, step: stepNumber, call: 1, toolCallId: decisionResult.toolCallId, tool: decision.type },
              decision.type === "read_image" ? { imageId: decision.imageId } : {},
              controller.signal,
              async (): Promise<{ result: AgentToolResult }> => {
                try {
                  if (decision.type === "observe_view") {
                    if (!this.#definition.observeView) throw new Error("Visual observation is unavailable");
                    const observation = await this.#definition.observeView(controller.signal);
                    if (controller.signal.aborted) observation.pointer?.dispose();
                    throwIfAborted(controller.signal);
                    let metadata: AgentValue;
                    try {
                      metadata = toAgentValue(observation.metadata);
                    } catch (error) {
                      observation.pointer?.dispose();
                      throw error;
                    }
                    saved = images.save({ ...observation, metadata });
                  } else saved = images.read(decision.imageId);
                  throwIfAborted(controller.signal);
                  return { result: { ok: true, value: toAgentValue(saved.reference) } };
                } catch (error) {
                  if (error instanceof AgentImageStorageLimitError) fatalError = error;
                  return {
                    result: {
                      ok: false,
                      error: {
                        code: controller.signal.aborted
                          ? "CANCELLED"
                          : error instanceof AgentImageStorageLimitError
                            ? "IMAGE_STORAGE_LIMIT"
                            : capturing
                              ? "VIEW_OBSERVATION_FAILED"
                              : "IMAGE_READ_FAILED",
                        message: controller.signal.aborted
                          ? "Image operation cancelled"
                          : getErrorMessage(error, "Image operation failed")
                      }
                    }
                  };
                }
              }
            );
            appendCallMessages(
              toolResultMessage(
                decisionResult.toolCallId!,
                outcome.result.ok ? { ok: true, result: outcome.result.value } : outcome.result
              )
            );
            // Record the completed/cancelled call before terminating the task.
            throwIfAborted(controller.signal);
            if (fatalError) throw fatalError;
            if (outcome.result.ok && saved) {
              appendCallMessages({
                role: "user",
                content: JSON.stringify({
                  contextKind: "view_observation",
                  ...saved.reference,
                  metadata: saved.metadata
                }),
                image: saved.image
              });
              reportImages(capturing ? "captured" : "read", transcript.offloadImages(), saved.reference.imageId);
              if (options.debugMode)
                this.#emit({
                  type: "view_observed",
                  taskId,
                  step: stepNumber,
                  toolCallId: decisionResult.toolCallId!,
                  image: { ...saved.image },
                  metadata: toAgentValue({ ...saved.reference, metadata: saved.metadata })
                });
              modelTools = buildAgentToolDefinitions(this.#definition, true);
            }
            return;
          }

          if (decisionResult.decision.type === "final") {
            // A response cannot close a turn while newly accepted steering is waiting.
            if (control?.hasPendingInputs()) return;
            throwIfAborted(controller.signal);
            const output = latestSuccessfulOutput(stageResults);
            const result: AgentTaskResult = {
              visualReferences: structuredClone(visualReferences),
              taskId,
              input: userInput,
              inputSource,
              inputs: structuredClone(inputs),
              finalMessage: decisionResult.decision.message,
              result: {
                status: "completed",
                message: decisionResult.decision.message,
                output,
                ...executionOutcomes(stageResults)
              },
              stageResults: structuredClone(stageResults),
              steps: steps.map(cloneStep)
            };
            // Terminal consumers seal their trace here; include resource cleanup first.
            releaseImages();
            this.#emit({ type: "task_completed", taskId, result });
            return result;
          }

          if (decisionResult.decision.type !== "execute") throw new Error("Unsupported legacy tool decision");
          this.#refreshConfiguration();
          projectFiles = makeProjectFiles();
          modelTools = buildAgentToolDefinitions(this.#definition, images.size > 0);
          const availableTools = this.#tools;
          const availableRegistry = new ToolRegistry(availableTools);
          const script = decisionResult.decision;
          executeSource = script.code;
          const preflightFailure = validateScriptApiReferences(script.code, availableTools);
          let scriptResult: AgentScriptResult;
          if (preflightFailure) {
            scriptResult = {
              ...preflightFailure,
              receipt: { executionId: `${taskId}:${stepNumber}`, status: "rejected" }
            };
          } else {
            this.#emit({ type: "script_started", taskId, step: stepNumber, code: script.code });
            const bindTools = (tools: readonly AgentTool[], registry: ToolRegistry) =>
              tools.map((tool) => ({
                name: tool.name,
                effect: tool.effect,
                describeCommand: tool.describeCommand,
                invoke: async (rawInput: AgentValue, signal: AbortSignal, call?: number) => {
                  if (taskToolCalls >= this.#maxToolCallsPerTask) {
                    taskBudgetExceeded = true;
                    return {
                      ok: false as const,
                      error: {
                        code: "TASK_TOOL_CALL_LIMIT",
                        retryable: false,
                        message: new AgentTaskToolLimitError(this.#maxToolCallsPerTask).message
                      }
                    };
                  }
                  taskToolCalls++;
                  const outcome = await this.#observeToolCall(
                    { taskId, step: stepNumber, call, tool: tool.name },
                    rawInput,
                    signal,
                    async () => ({ result: await this.#executeTool(tool.name, rawInput, signal, registry) })
                  );
                  return outcome.result;
                }
              }));
            scriptResult = await executeAgentEdit(
              this.#scriptRuntime,
              this.#scriptChecker,
              {
                id: `${taskId}:${stepNumber}`,
                source: script.code,
                editorComponents: this.#definition.editorComponents,
                toolBindings: bindTools(availableTools, availableRegistry),
                signal: controller.signal,
                maxToolCalls: Math.min(this.#maxToolCallsPerScript, this.#maxToolCallsPerTask - taskToolCalls),
                timeoutMs: this.#scriptTimeoutMs,
                onTrace: (trace) => {
                  this.#emit({
                    type: "script_trace",
                    taskId,
                    step: stepNumber,
                    trace: structuredClone(trace)
                  });
                }
              },
              projectDeclarationModules(projectFiles, fileCatalog().modules),
              this.#definition.beginEdit
                ? async (signal) => {
                    const transaction = await this.#definition.beginEdit!(`${taskId}:${stepNumber}`, signal);
                    try {
                      const registry = new ToolRegistry(transaction.tools);
                      // Live system queries are independent reads. Rebind only reads owned
                      // by this draft; authoring writes still require a transaction binding.
                      const names = availableTools
                        .filter(
                          (tool) => tool.effect !== "command" && (tool.effect !== "read" || registry.get(tool.name))
                        )
                        .map((tool) => tool.name);
                      return { transaction, toolBindings: bindTools(registry.select(names), registry) };
                    } catch (error) {
                      await transaction.discard();
                      throw error;
                    }
                  }
                : undefined
            );
          }

          const progressSignature = scriptResult.ok
            ? successfulScriptSignature(script.code, {
                output: scriptResult.output,
                console: scriptResult.console ?? [],
                returnValuePresent: scriptResult.returnValuePresent ?? true
              })
            : undefined;
          scriptResult = presentScriptOutput(scriptResult, (content) =>
            outputFiles.save(`${taskId}:${stepNumber}`, content)
          );
          step.scriptResult = structuredClone(scriptResult);
          stageResults.push(structuredClone(scriptResult));
          this.#emit({
            type: "script_finished",
            taskId,
            step: stepNumber,
            result: structuredClone(scriptResult)
          });
          appendCallMessages(toolResultMessage(decisionResult.toolCallId!, modelToolResultFromScript(scriptResult)));
          if (
            scriptResult.receipt?.status === "publication_failed" ||
            scriptResult.receipt?.commands?.some((command) => command.status === "unknown")
          ) {
            throw new Error(scriptResult.ok ? "Edit publication failed" : scriptResult.error.message);
          }
          throwIfAborted(controller.signal);
          if (taskBudgetExceeded || (!scriptResult.ok && taskToolCalls >= this.#maxToolCallsPerTask))
            throw new AgentTaskToolLimitError(this.#maxToolCallsPerTask);

          if (scriptResult.ok === true) {
            batchScriptSucceeded = true;
          } else if (
            scriptResult.error.phase === "tool" &&
            !["INVALID_ARGUMENTS", "UNKNOWN_TOOL"].includes(scriptResult.error.code)
          ) {
            // Accepted calls can fail in the host. Editing the script cannot repair
            // an invalid Tool result; these failures have their own bounded budget.
            batchToolFailure = scriptResult.error.message;
          } else {
            batchScriptFailure = scriptResult.error.message;
          }

          if (scriptResult.ok === true) {
            const signature = progressSignature!;
            consecutiveNoProgressScripts =
              signature === previousSuccessfulScriptSignature ? consecutiveNoProgressScripts + 1 : 1;
            previousSuccessfulScriptSignature = signature;
          } else {
            previousSuccessfulScriptSignature = undefined;
            consecutiveNoProgressScripts = 0;
          }
        };
        const decisionResultOriginal = decisionResult;
        const batch = await runToolBatch(
          calls,
          (call) => call.decision.type === "file" && isParallelFileTool(call.decision.name),
          executeCall,
          controller.signal
        );
        // Tool replies stay adjacent to their assistant call batch. Images follow all replies.
        for (const [index, call] of calls.entries()) {
          if (call.toolCallId && !messagesByCall[index].some((message) => message.role === "tool")) {
            const started = startedCalls.has(index);
            messagesByCall[index].push(
              toolResultMessage(call.toolCallId, {
                ok: false,
                error: {
                  code: started ? "INTERRUPTED" : "NOT_STARTED",
                  message: started
                    ? "Call interrupted; inspect host receipts before retrying side effects."
                    : "Call was not started because this batch was interrupted."
                }
              })
            );
          }
        }
        const messages = messagesByCall.flat();
        appendTranscript(
          ...messages.filter((message) => message.role === "tool"),
          ...messages.filter((message) => message.role !== "tool")
        );
        transcript.offloadImages();
        if (batch.error) throw batch.error;
        // All calls in this batch came from one model response. The model has not
        // seen their results yet, so they represent at most one repair attempt.
        if (batchScriptFailure !== undefined) consecutiveScriptFailures += 1;
        else if (batchScriptSucceeded) consecutiveScriptFailures = 0;
        if (batchToolFailure !== undefined) toolFailureRounds += 1;
        if (toolFailureRounds >= this.#maxToolFailureRounds) {
          throw new AgentToolFailureLimitError(this.#maxToolFailureRounds, batchToolFailure!);
        }
        if (consecutiveScriptFailures >= this.#maxScriptRepairs) {
          throw new AgentScriptRepairLimitError(
            this.#maxScriptRepairs,
            batchScriptFailure ?? "Repeated script failures"
          );
        }
        if (consecutiveNoProgressScripts >= this.#maxConsecutiveNoProgressScripts) {
          throw new AgentNoProgressError(this.#maxConsecutiveNoProgressScripts);
        }
        consecutiveInvalidBatches = calls.every((call) => call.decision.type === "invalid_tool")
          ? consecutiveInvalidBatches + 1
          : 0;
        if (consecutiveInvalidBatches >= this.#maxModelAttempts) {
          const invalid = calls[0].decision;
          throw new Error(invalid.type === "invalid_tool" ? invalid.message : "Invalid tool calls");
        }
        const completed = batch.values.find((value) => value !== undefined);
        if (completed) return completed;
        stepNumber += calls.length - 1;
      }
    } catch (error) {
      const normalizedError = controller.signal.aborted ? new AgentCancelledError() : normalizeError(error);
      const status = controller.signal.aborted ? "cancelled" : "failed";
      const executionSummary = summarizeExecutions(
        stageResults.flatMap((stage) => (stage.receipt ? [stage.receipt] : []))
      );
      const category = controller.signal.aborted
        ? "cancelled"
        : executionSummary.uncertain.length
          ? "publication"
          : classifyFailure(normalizedError);
      const message = describeTaskFailure(normalizedError.message, executionSummary, category, modelFailed);
      const failure: AgentTaskFailure = {
        visualReferences: structuredClone(visualReferences),
        taskId,
        input: userInput,
        inputSource,
        inputs: structuredClone(inputs),
        status,
        category,
        executionSummary,
        message,
        result: { status, message, ...executionOutcomes(stageResults) },
        stageResults: structuredClone(stageResults),
        steps: steps.map(cloneStep)
      };
      if (control) {
        transcript.releaseImages();
        const messages = transcript.active;
        const pending = new Set<string>();
        for (const message of messages) {
          if (message.role === "assistant") for (const call of message.toolCalls ?? []) pending.add(call.id);
          if (message.role === "tool") pending.delete(message.toolCallId);
        }
        for (const toolCallId of pending)
          messages.push(
            toolResultMessage(toolCallId, {
              ok: false,
              error: {
                code: "INTERRUPTED",
                message: "Execution was interrupted. Inspect retained host receipts before retrying any side effect."
              }
            })
          );
        control.saveContinuation({
          taskId,
          visualReferences: structuredClone(visualReferences),
          transcript: messages,
          inputs: structuredClone(inputs),
          stageResults: structuredClone(stageResults),
          nextStep: (steps.at(-1)?.step ?? (control.continuation?.nextStep ?? 1) - 1) + 1
        });
      }
      taskFailures.set(normalizedError, failure);
      releaseImages();
      this.#emit({
        type: "task_failed",
        taskId,
        error: normalizedError,
        failure: structuredClone(failure),
        steps: failure.steps.map(cloneStep)
      });
      throw normalizedError;
    } finally {
      controller.signal.removeEventListener("abort", releaseImages);
      releaseImages();
      transcript.clear();
      this.#activeTaskId = null;
      this.#controller = null;
    }
  }

  async #requestModelTurn(input: {
    taskId: string;
    step: number;
    userInput: string;
    inputSource: NonNullable<AgentRunOptions["inputSource"]>;
    conversationHistory: ConversationHistorySnapshot;
    worldThumbnail: AgentValue;
    taskContext?: AgentValue;
    inputs: AgentUserInput[];
    transcript: AgentContextTranscript;
    images: AgentImageStore;
    contextCompaction: ContextCompactionRequest;
    systemPrompt: string;
    tools: AgentModelToolDefinition[];
    model?: string;
    debugMode: boolean;
    signal: AbortSignal;
  }): Promise<ModelTurnResult> {
    const attempts: AgentModelAttempt[] = [];
    const roundStarted = performance.now();
    const deadline = roundStarted + MODEL_ROUND_TIMEOUT_MS;
    let correction: AgentMessage | undefined;
    for (let attemptNumber = 1; attemptNumber <= this.#maxModelAttempts; attemptNumber += 1) {
      if (input.signal.aborted) throw new AgentModelRequestFailure(new AgentCancelledError(), attempts);
      const messages = buildAgentMessages({
        systemPrompt: input.systemPrompt,
        taskId: input.taskId,
        userInput: input.userInput,
        inputSource: input.inputSource,
        taskContext: input.taskContext,
        inputs: input.inputs,
        worldThumbnail: input.worldThumbnail,
        conversationHistory: input.conversationHistory,
        transcript: input.transcript.active,
        images: input.images.references()
      });
      if (correction) messages.push(correction);
      const contextRequest = input.transcript.captureRequest(messages);
      const requestMessages = input.debugMode ? redactMessageImages(messages) : undefined;
      if (requestMessages) {
        this.#emit({
          type: "model_request",
          taskId: input.taskId,
          step: input.step,
          attempt: attemptNumber,
          // The trace store interns images; attempt diagnostics remain lightweight.
          messages: structuredClone(messages.map(withoutReasoningContent))
        });
      }
      const startedAt = performance.now();
      let protocolSequence = 0;
      const onRecovery = (event: ModelRecoveryEvent) => {
        if (input.signal.aborted) return;
        this.#emit({
          type: "model_recovery",
          taskId: input.taskId,
          step: input.step,
          attempt: attemptNumber,
          recovery: event
        });
      };
      let result: Awaited<ReturnType<typeof requestAsapChat>>;
      let requestStarted = false;
      try {
        if (performance.now() >= deadline)
          throw Object.assign(new Error("本轮模型请求与恢复的时间预算已耗尽"), { code: "MODEL_TIMEOUT" });
        if (attemptNumber > 1)
          onRecovery({
            sequence: ++protocolSequence,
            phase: "requesting",
            layer: "protocol",
            attempt: attemptNumber,
            maxAttempts: this.#maxModelAttempts,
            elapsedMs: performance.now() - roundStarted,
            remainingMs: deadline - performance.now(),
            delayMs: 0
          });
        throwIfAborted(input.signal);
        requestStarted = true;
        result = await requestAsapChat({
          timeoutMs: deadline - performance.now(),
          onRecovery,
          messages,
          imageBudget: input.images.budget,
          contextCompaction: input.contextCompaction,
          model: input.model,
          tools: input.tools,
          toolChoice: "auto",
          debugMode: input.debugMode,
          signal: input.signal
        });
      } catch (error) {
        const requestError = normalizeError(error) as Error & Partial<AsapModelError>;
        const cancelled = input.signal.aborted || requestError instanceof AgentCancelledError;
        if (requestStarted)
          attempts.push({
            attempt: attemptNumber,
            rawContent: "",
            error: getErrorMessage(requestError, "ASAP 模型调用失败"),
            category: cancelled ? "cancelled" : classifyFailure(requestError),
            errorCode: requestError.code,
            errorDetails: requestError.details,
            finishReason: requestError.finishReason,
            traceId: requestError.traceId,
            telemetry: requestError.telemetry,
            modelAttempts: requestError.modelAttempts,
            requestMessages,
            durationMilliseconds: performance.now() - startedAt
          });
        throw new AgentModelRequestFailure(cancelled ? new AgentCancelledError() : requestError, attempts);
      }

      const attempt: AgentModelAttempt = {
        attempt: attemptNumber,
        rawContent: result.content,
        error: null,
        finishReason: result.finishReason,
        toolCalls: structuredClone(result.toolCalls),
        traceId: result.traceId,
        debug: result.debug,
        telemetry: result.telemetry,
        modelAttempts: result.modelAttempts,
        contextCompaction: result.contextCompaction,
        requestMessages,
        durationMilliseconds: performance.now() - startedAt
      };
      if (input.signal.aborted) {
        attempt.category = "cancelled";
        attempt.error = new AgentCancelledError().message;
        throw new AgentModelRequestFailure(new AgentCancelledError(), [...attempts, attempt]);
      }
      try {
        // Persist before protocol correction: a retry must use the already compacted history.
        attempt.contextCompaction = input.transcript.applyResponse(contextRequest, messages, result.contextCompaction);
      } catch (error) {
        // Invalid state patches are transport contract failures, never model-repair prompts.
        attempt.contextCompaction = undefined;
        attempt.category = "context";
        attempt.error = getErrorMessage(error, "Invalid contextCompaction");
        throw new AgentModelRequestFailure(normalizeError(error), [...attempts, attempt]);
      }
      try {
        if (result.finishReason === "length") {
          throw new Error("模型输出因长度上限被截断");
        }
        if (result.finishReason === "content_filter") {
          throw new Error("模型输出被内容安全策略终止");
        }
        if (result.toolCalls.length > 0) {
          if (result.finishReason !== "tool_calls") {
            throw new Error("模型返回 Tool Call，但 finishReason 不是 tool_calls");
          }
          const ids = new Set(result.toolCalls.map((call) => call.id));
          if (ids.size !== result.toolCalls.length || result.toolCalls.some((call) => !call.id.trim()))
            throw new Error("Tool call IDs must be non-empty and unique within a response");
          const calls = result.toolCalls.map((toolCall) => {
            let decision: AgentDecision;
            try {
              decision = parseAgentToolCall(toolCall);
            } catch (error) {
              decision = {
                type: "invalid_tool",
                name: toolCall.function.name,
                message: getErrorMessage(error, "Invalid tool arguments")
              };
            }
            return { decision, toolCallId: toolCall.id };
          });
          return {
            ...calls[0],
            calls,
            assistantMessage: {
              role: "assistant",
              content: result.content,
              ...(result.reasoningContent !== undefined ? { reasoningContent: result.reasoningContent } : {}),
              toolCalls: structuredClone(result.toolCalls)
            },
            attempts: [...attempts, attempt]
          };
        }
        if (result.finishReason !== "stop") {
          throw new Error(`模型没有 Tool Call，但 finishReason 为 ${result.finishReason}`);
        }
        const message = parseAgentFinalMessage(result.content);
        return {
          decision: { type: "final", message },
          assistantMessage: {
            role: "assistant",
            content: result.content,
            ...(result.reasoningContent !== undefined ? { reasoningContent: result.reasoningContent } : {})
          },
          attempts: [...attempts, attempt]
        };
      } catch (error) {
        attempt.category =
          result.finishReason === "length"
            ? "output_limit"
            : result.finishReason === "content_filter"
              ? "content_filter"
              : "protocol";
        attempt.error = getErrorMessage(error, "模型响应不符合 Agent 协议");
        attempts.push(attempt);
        if (result.finishReason === "content_filter" || attemptNumber === this.#maxModelAttempts) {
          throw new AgentDecisionError(attempts);
        }
        onRecovery({
          sequence: ++protocolSequence,
          phase: "retry_wait",
          layer: "protocol",
          attempt: attemptNumber + 1,
          maxAttempts: this.#maxModelAttempts,
          elapsedMs: performance.now() - roundStarted,
          remainingMs: Math.max(0, deadline - performance.now()),
          delayMs: 0,
          category: attempt.category
        });
        correction = buildModelResponseCorrection(result, attempt.error);
      }
    }
    throw new AgentDecisionError(attempts);
  }

  /** Every admitted tool publishes its result once, independent of transcript formatting. */
  async #observeToolCall<T extends { result: AgentToolResult; receipt?: AgentExecutionReceipt }>(
    identity: Omit<Extract<AgentEvent, { type: "tool_started" }>, "type" | "input">,
    input: AgentValue,
    signal: AbortSignal,
    invoke: () => Promise<T>
  ): Promise<T> {
    this.#emit({ type: "tool_started", ...identity, input: structuredClone(input) });
    let outcome: T;
    try {
      outcome = await invoke();
    } catch (error) {
      this.#emit({
        type: "tool_finished",
        ...identity,
        result: {
          ok: false,
          error: {
            code: signal.aborted ? "CANCELLED" : "TOOL_EXECUTION_FAILED",
            message: getErrorMessage(error, "Tool execution failed")
          }
        }
      });
      throw error;
    }
    this.#emit({
      type: "tool_finished",
      ...identity,
      result: structuredClone(outcome.result),
      receipt: outcome.receipt
    });
    return outcome;
  }

  async #executeTool(
    toolName: string,
    rawInput: AgentValue,
    signal: AbortSignal,
    registry: ToolRegistry = this.#toolRegistry
  ): Promise<AgentToolResult> {
    const tool = registry.get(toolName);
    if (!tool) return toolError("UNKNOWN_TOOL", `未注册工具：${toolName}`);

    let parsedInput: unknown;
    try {
      parsedInput = tool.parseInput(rawInput);
    } catch (error) {
      return toolError(
        "INVALID_ARGUMENTS",
        getErrorMessage(error, "工具参数校验失败"),
        false,
        undefined,
        undefined,
        getErrorStack(error)
      );
    }

    let value;
    try {
      throwIfAborted(signal);
      value = await tool.execute(parsedInput, { signal });
      throwIfAborted(signal);
    } catch (error) {
      throwIfAborted(signal);
      if (error instanceof AgentToolExecutionError) {
        let details: AgentValue | undefined;
        try {
          details = error.details === undefined ? undefined : toAgentValue(error.details);
        } catch (detailsError) {
          return toolError(
            "INVALID_TOOL_RESULT",
            `结构化 Tool Error details 不是合法 AgentValue：${getErrorMessage(detailsError, "未知错误")}`,
            error.executed,
            undefined,
            undefined,
            joinErrorStacks(detailsError, error)
          );
        }
        const result = toolError(
          error.code,
          error.message,
          error.executed,
          error.retryable,
          details,
          getErrorStack(error)
        );
        if (error.outcomeKnown) result.error.outcomeKnown = true;
        return result;
      }
      if (error instanceof AgentValueError) {
        return toolError("INVALID_TOOL_RESULT", error.message, true, undefined, undefined, getErrorStack(error));
      }
      return toolError(
        "TOOL_EXECUTION_FAILED",
        getErrorMessage(error, "工具执行失败"),
        true,
        undefined,
        undefined,
        getErrorStack(error)
      );
    }

    try {
      const parsedValue = tool.parseOutput(value);
      return { ok: true, value: toAgentToolOutput(parsedValue) };
    } catch (error) {
      return toolError(
        "INVALID_TOOL_RESULT",
        getErrorMessage(error, "API 返回值不符合 Runtime 契约"),
        true,
        undefined,
        undefined,
        getErrorStack(error)
      );
    }
  }

  async #provideWorldThumbnail(): Promise<AgentValue> {
    const thumbnail = await this.#definition.provideWorldThumbnail?.();
    return toAgentValue(thumbnail ?? null);
  }

  #emit(event: AgentEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // A UI observer must never break the agent task.
      }
    }
  }
}

export class AgentBusyError extends Error {
  constructor() {
    super("AgentLoop already has a running task");
    this.name = "AgentBusyError";
  }
}

export class AgentCancelledError extends Error {
  constructor() {
    super("Agent task cancelled");
    this.name = "AgentCancelledError";
  }
}

export class AgentScriptRepairLimitError extends Error {
  constructor(maxRepairs: number, lastError: string) {
    super(`Agent Script repair failed in ${maxRepairs} model response rounds: ${lastError}`);
    this.name = "AgentScriptRepairLimitError";
  }
}

export class AgentToolFailureLimitError extends Error {
  constructor(limit: number, lastError: string) {
    super(
      `TOOL_FAILURE_LIMIT: Tool execution or output failed in ${limit} model response rounds. ` +
        `Stopped further calls; inspect execution receipts before retrying writes. Last Tool error: ${lastError}`
    );
    this.name = "AgentToolFailureLimitError";
  }
}

export class AgentTaskToolLimitError extends Error {
  constructor(limit: number) {
    super(
      `TASK_TOOL_CALL_LIMIT: 本次任务已达到 ${limit} 次接口调用上限，已停止继续执行。检查未完成不代表条件不符合；此前提交的修改仍然保留。`
    );
    this.name = "AgentTaskToolLimitError";
  }
}

export class AgentNoProgressError extends Error {
  constructor(maxConsecutiveNoProgressScripts: number) {
    super(
      "Agent task made no model-visible progress: " +
        `the same Agent Script produced the same successful output ${maxConsecutiveNoProgressScripts} consecutive times`
    );
    this.name = "AgentNoProgressError";
  }
}

export class AgentDecisionError extends Error {
  readonly attempts: AgentModelAttempt[];
  readonly category;

  constructor(attempts: AgentModelAttempt[]) {
    const lastError = attempts[attempts.length - 1]?.error || "Agent 决策生成失败";
    super(lastError);
    this.name = "AgentDecisionError";
    this.category = attempts.at(-1)?.category ?? "protocol";
    this.attempts = attempts.map((attempt) => ({ ...attempt }));
  }
}

/**
 * Carries request-attempt evidence to the immediate AgentLoop boundary without
 * replacing the transport error that callers use for recovery and UI policy.
 */
class AgentModelRequestFailure extends Error {
  readonly requestError: Error;
  readonly attempts: AgentModelAttempt[];

  constructor(requestError: Error, attempts: AgentModelAttempt[]) {
    super(requestError.message);
    this.name = "AgentModelRequestFailure";
    this.requestError = requestError;
    this.attempts = attempts.map((attempt) => ({ ...attempt }));
  }
}

export function getAgentTaskFailure(value: unknown): AgentTaskFailure | undefined {
  if (!(value instanceof Error)) return undefined;
  const failure = taskFailures.get(value);
  return failure ? structuredClone(failure) : undefined;
}

function latestSuccessfulOutput(results: readonly AgentScriptResult[]): AgentValue {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result.ok) return structuredClone(result.output);
  }
  return null;
}

function successfulScriptSignature(code: string, output: AgentValue): string {
  return `${code.trim()}\n${JSON.stringify(output)}`;
}

function toolError(
  code: string,
  message: string,
  executed = false,
  retryable?: boolean,
  details?: AgentValue,
  stack?: string
): Extract<AgentToolResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(executed ? { executed: true } : {}),
      ...(retryable !== undefined ? { retryable } : {}),
      ...(details !== undefined ? { details } : {}),
      ...(stack ? { stack } : {})
    }
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new AgentCancelledError();
}

function normalizeError(value: unknown): Error {
  return value instanceof Error ? value : new Error(getErrorMessage(value, "Agent task failed"));
}

function getErrorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value) return value;
  return fallback;
}

function getErrorStack(value: unknown): string | undefined {
  return value instanceof Error ? value.stack : undefined;
}

function joinErrorStacks(...values: unknown[]): string | undefined {
  const stacks = values.map(getErrorStack).filter((stack): stack is string => Boolean(stack));
  return stacks.length > 0 ? stacks.join("\nCaused by:\n") : undefined;
}

function buildModelResponseCorrection(
  result: Awaited<ReturnType<typeof requestAsapChat>>,
  reason: string
): AgentMessage {
  return {
    role: "system",
    content: JSON.stringify({
      contextKind: "agent_protocol_correction",
      validationError: reason,
      previousResponse: {
        content: result.content,
        finishReason: result.finishReason,
        toolCalls: result.toolCalls
      },
      executionStatus: "no_tool_was_executed",
      instruction: "修正上一份响应。只返回当前下一步的一个 Tool Call，或在任务已完成时返回最终文本。"
    })
  };
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function validateScriptApiCoverage(definition: AgentLoopOptions["definition"], tools: readonly AgentTool[]): void {
  const knownTools = new Set(tools.map(({ name }) => name));
  // Reject malformed package bindings before the model can perform any operation.
  createAgentEditorFacade(definition.editorComponents ?? [], async () => null);
  for (const binding of definition.editorComponents ?? []) {
    for (const name of [binding.queryTool, ...Object.values(binding.methods)]) {
      if (!knownTools.has(name))
        throw new Error(`Editor component '${binding.type}' references unknown Tool '${name}'`);
    }
  }
  const assignedTools = new Set<string>();
  const entryNames = new Set<string>();
  const moduleIds = new Set<string>();
  for (const module of definition.scriptApi.modules) {
    if (!module.id.trim() || moduleIds.has(module.id)) {
      throw new Error(`Duplicate or empty Agent API declaration module '${module.id}'`);
    }
    if (!module.id.endsWith(".d.ts"))
      throw new Error(`Agent API declaration module '${module.id}' is not a .d.ts file`);
    if (!module.source.trim()) throw new Error(`Agent API declaration module '${module.id}' has no source`);
    moduleIds.add(module.id);
  }
  for (const module of definition.scriptApi.modules) {
    for (const importedModuleId of module.imports) {
      if (!moduleIds.has(importedModuleId)) {
        throw new Error(`Agent API declaration module '${module.id}' imports unknown module '${importedModuleId}'`);
      }
    }
    for (const name of module.toolNames ?? []) {
      if (!knownTools.has(name)) throw new Error(`Agent API module '${module.id}' references unknown Tool '${name}'`);
      if (assignedTools.has(name)) throw new Error(`Agent Tool '${name}' belongs to more than one API symbol`);
      assignedTools.add(name);
    }
  }
  for (const entry of definition.scriptApi.entries) {
    // Different declaration modules can contribute overloads of the same facade.
    const key = JSON.stringify([entry.moduleId, entry.name]);
    if (!entry.name.trim() || entryNames.has(key)) {
      throw new Error(`Duplicate or empty Agent API entry '${entry.name}' in '${entry.moduleId}'`);
    }
    entryNames.add(key);
    if (!moduleIds.has(entry.moduleId)) {
      throw new Error(`Agent API entry '${entry.name}' references unknown module '${entry.moduleId}'`);
    }
  }
  const missing = tools.filter(({ name }) => !assignedTools.has(name)).map(({ name }) => name);
  if (missing.length) throw new Error(`Agent Tools are missing knowledge declaration modules: ${missing.join(", ")}`);
}

function toolResultMessage(toolCallId: string, result: ModelToolResult | { ok: true }): AgentMessage {
  if (!toolCallId) throw new Error("Agent Tool Result 缺少 toolCallId");
  return {
    role: "tool",
    toolCallId,
    content: JSON.stringify(result)
  };
}

function modelToolResultFromScript(result: AgentScriptResult): ModelToolResult {
  const display = {
    console: result.console,
    returnValuePresent: result.ok ? (result.returnValuePresent ?? true) : false,
    outputFile: result.outputFile
  };
  if (result.ok === true)
    return {
      ...display,
      ok: true,
      result: structuredClone(result.output),
      ...(result.receipt ? { receipt: result.receipt } : {})
    };
  return {
    ok: false,
    ...display,
    error: result.error.message,
    code: result.error.code,
    phase: result.error.phase,
    ...(result.error.tool ? { tool: result.error.tool } : {}),
    ...(result.error.retryable !== undefined ? { retryable: result.error.retryable } : {}),
    ...(result.receipt ? { receipt: result.receipt } : {}),
    ...(result.error.location ? { location: result.error.location } : {}),
    ...(result.error.details !== undefined ? { details: structuredClone(result.error.details) } : {}),
    ...(result.error.execution ? { execution: structuredClone(result.error.execution) } : {})
  };
}

function validateScriptApiReferences(source: string, tools: readonly AgentTool[]): AgentScriptResult | null {
  const knownTools = new Set(tools.map(({ name }) => name));
  const references = extractAgentScriptToolReferences(source);
  const unknown = references.filter((name) => !knownTools.has(name));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_TOOL",
        phase: "parse",
        message: `Agent Script 引用了未注册的 API：${unknown.join(", ")}；脚本尚未执行`,
        tool: unknown[0]
      }
    };
  }
  return null;
}

function cloneStep(step: AgentStepRecord): AgentStepRecord {
  return structuredClone(step);
}

function executionOutcomes(stages: readonly AgentScriptResult[]) {
  const executions = stages.flatMap((stage) => (stage.receipt ? [structuredClone(stage.receipt)] : []));
  return executions.length ? { executions } : {};
}

function redactMessageImages(messages: readonly AgentMessage[]): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || !message.image) return structuredClone(withoutReasoningContent(message));
    return { role: "user", content: `${message.content}\n[Image omitted from trace payload]` };
  });
}
