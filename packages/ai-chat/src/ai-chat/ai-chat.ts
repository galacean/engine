import { recoveryStatus } from "./model-recovery";
import type { AgentSessionSnapshot } from "./session-data";
import { AIChatSession, type AIChatSubmission } from "./ai-chat-session";
import type { AgentInputTarget, AgentModelAttempt, AgentRunOptions, AgentStepRecord } from "./agent-types";

export type AIChatElements = {
  messages: HTMLElement;
  form: HTMLFormElement;
  input: HTMLInputElement;
  sendButton: HTMLButtonElement;
  error: HTMLElement;
};

export type AIChatRunOptions = AgentRunOptions;

export type AIChatOptions = {
  session: AIChatSession;
  elements: AIChatElements;
  welcomeMessage?: string;
  getRunOptions(): AIChatRunOptions;
  onBusyChange?(busy: boolean): void;
  onActivityChange?(activity: "idle" | "thinking" | "tool"): void;
};

type ChatDebugTrace = {
  model: string;
  previousRecordCount: number;
  steps: AgentStepRecord[];
  failedAttempts?: AgentModelAttempt[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  debugEnabled?: boolean;
  debug?: ChatDebugTrace;
};

export class AIChat {
  readonly #session: AIChatSession;
  readonly #elements: AIChatElements;
  readonly #getRunOptions: () => AIChatRunOptions;
  readonly #onBusyChange?: (busy: boolean) => void;
  readonly #onActivityChange?: (activity: "idle" | "thinking" | "tool") => void;
  readonly #welcomeMessage: string;
  readonly #unsubscribeAgent: () => void;
  readonly #onSubmit: (event: SubmitEvent) => void;
  readonly #onSendClick: () => void;
  readonly #onInputKeyDown: (event: KeyboardEvent) => void;
  #debugVisible = false;
  #destroyed = false;
  #admissionError = "";

  constructor(options: AIChatOptions) {
    this.#session = options.session;
    this.#elements = options.elements;
    this.#getRunOptions = options.getRunOptions;
    this.#onBusyChange = options.onBusyChange;
    this.#onActivityChange = options.onActivityChange;
    this.#welcomeMessage = options.welcomeMessage || "你好，我是由 ASAP AgentScriptCalling 驱动的 AI 助手。";
    this.#unsubscribeAgent = this.#session.subscribeState(() => {
      this.#admissionError = "";
      this.#render();
    });
    this.#onSubmit = (event) => {
      event.preventDefault();
      void this.send();
    };
    this.#onSendClick = () => void this.send();
    this.#onInputKeyDown = (event) => {
      if (event.key === "Escape" && this.busy) {
        event.preventDefault();
        this.cancel();
        return;
      }
      if (
        event.key === "Enter" &&
        !event.isComposing &&
        !this.#elements.input.value.trim() &&
        this.#session.canContinue
      ) {
        event.preventDefault();
        void this.continue();
        return;
      }
      if (event.key !== "Enter" || event.isComposing) {
        return;
      }
      event.preventDefault();
      void this.send(this.#elements.input.value, event.shiftKey ? "next-turn" : "next-step");
    };
    this.#elements.form.addEventListener("submit", this.#onSubmit);
    this.#elements.sendButton.addEventListener("click", this.#onSendClick);
    this.#elements.input.addEventListener("keydown", this.#onInputKeyDown);
    this.#render();
  }

  get busy(): boolean {
    return this.#session.running;
  }

  setDebugVisible(visible: boolean): void {
    this.#debugVisible = visible;
    this.#render();
  }

  setDraft(value: string): void {
    if (!this.#destroyed) this.#elements.input.value = value;
  }

  focus(): void {
    if (!this.#destroyed) this.#elements.input.focus();
  }

  cancel(): void {
    this.#session.cancel();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#unsubscribeAgent();
    this.#elements.form.removeEventListener("submit", this.#onSubmit);
    this.#elements.sendButton.removeEventListener("click", this.#onSendClick);
    this.#elements.input.removeEventListener("keydown", this.#onInputKeyDown);
  }

  async continue(): Promise<void> {
    if (this.#destroyed) return;
    let submission: AIChatSubmission;
    try {
      submission = await this.#session.continue();
    } catch (error) {
      this.#showAdmissionError(error, "无法继续");
      return;
    }
    await submission.completion.catch(() => undefined);
  }

  async send(text = this.#elements.input.value, target: AgentInputTarget = "next-step"): Promise<void> {
    const content = text.trim();
    if (!content || this.#destroyed) return;
    let submission: AIChatSubmission;
    try {
      submission = this.#session.submit(content, this.#getRunOptions(), target);
    } catch (error) {
      this.#showAdmissionError(error, "无法发送");
      return;
    }
    if (!this.#destroyed) {
      this.#elements.input.value = "";
      this.focus();
    }
    // Task success/failure is rendered exclusively by the Session subscription.
    // Never focus or write to the view when a pending task settles.
    await submission.completion.catch(() => undefined);
  }

  #showAdmissionError(error: unknown, fallback: string): void {
    if (this.#destroyed) return;
    this.#admissionError = getErrorMessage(error, fallback);
    this.#render();
  }

  #render(): void {
    if (this.#destroyed) return;
    const snapshot = this.#session.snapshot;
    const outcome = snapshot.current?.outcome;
    this.#elements.error.textContent = this.#admissionError || (outcome?.status === "failed" ? outcome.message : "");
    this.#elements.sendButton.disabled = false;
    this.#elements.sendButton.textContent = snapshot.running ? "补充" : "发送";
    this.#onBusyChange?.(snapshot.running);
    const progress = snapshot.current?.progress.at(-1);
    this.#onActivityChange?.(
      !snapshot.running ? "idle" : progress?.kind === "tool" || progress?.kind === "script" ? "tool" : "thinking"
    );
    const fragment = document.createDocumentFragment();
    for (const message of projectMessages(snapshot, this.#welcomeMessage)) {
      const bubble = document.createElement("div");
      bubble.className = `message ${message.role}${message.pending ? " pending" : ""}`;
      bubble.dataset.messageId = message.id;
      if (message.role === "assistant" && this.#debugVisible && message.debugEnabled && message.debug) {
        bubble.classList.add("debug-message");
        renderDebugTrace(bubble, message.content, message.debug);
      } else {
        bubble.textContent = message.content;
      }
      fragment.appendChild(bubble);
    }
    this.#elements.messages.replaceChildren(fragment);
    requestAnimationFrame(() => {
      if (!this.#destroyed) this.#elements.messages.scrollTop = this.#elements.messages.scrollHeight;
    });
  }
}

function renderDebugTrace(container: HTMLElement, displayContent: string, trace: ChatDebugTrace): void {
  const rawSection = document.createElement("section");
  rawSection.className = "debug-raw-section";
  const rawHeader = document.createElement("div");
  rawHeader.className = "debug-section-label";
  rawHeader.textContent = "AgentLoop 轨迹";
  const routeNote = document.createElement("p");
  routeNote.className = "debug-route-note";
  routeNote.textContent = `请求 ASAP 模型：${trace.model} · 携带历史记录：${trace.previousRecordCount} 条`;
  rawSection.append(rawHeader, routeNote);

  for (const step of trace.steps) {
    const details = document.createElement("details");
    details.className = "debug-attempt valid";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent =
      step.decision.type === "file" || step.decision.type === "invalid_tool"
        ? `Step ${step.step}: ${step.decision.name}`
        : step.decision.type === "execute"
          ? `第 ${step.step} 步 · 执行 Agent Script`
          : step.decision.type === "read_tool"
            ? `第 ${step.step} 步 · Read ${step.decision.file_path}`
            : step.decision.type === "list_tool"
              ? `第 ${step.step} 步 · List ${step.decision.path || "/"}`
              : step.decision.type === "search_tool"
                ? `第 ${step.step} 步 · Search ${step.decision.path || "/"}`
                : step.decision.type === "snapshot"
                  ? `第 ${step.step} 步 · 观察当前画面`
                  : step.decision.type === "pick"
                    ? `第 ${step.step} 步 · 查询快照 ${step.decision.input.file_path}`
                    : `第 ${step.step} 步 · 任务完成`;
    details.appendChild(summary);

    for (const attempt of step.attempts) {
      appendAttempt(details, attempt);
    }
    if (step.scriptResult) {
      const result = document.createElement("pre");
      result.textContent = `Agent Script Result\n${JSON.stringify(step.scriptResult, null, 2)}`;
      details.appendChild(result);
    }
    rawSection.appendChild(details);
  }

  if (trace.failedAttempts?.length) {
    const details = document.createElement("details");
    details.className = "debug-attempt invalid";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = "未能生成合法 Agent 决策";
    details.appendChild(summary);
    for (const attempt of trace.failedAttempts) {
      appendAttempt(details, attempt);
    }
    rawSection.appendChild(details);
  }

  const displaySection = document.createElement("section");
  displaySection.className = "debug-display-section";
  const displayHeader = document.createElement("div");
  displayHeader.className = "debug-section-label";
  displayHeader.textContent = "应用展示";
  const display = document.createElement("div");
  display.className = "debug-display-content";
  display.textContent = displayContent;
  displaySection.append(displayHeader, display);
  container.append(rawSection, displaySection);
}

function appendAttempt(container: HTMLElement, attempt: AgentModelAttempt): void {
  const label = document.createElement("p");
  label.className = "debug-route-note";
  const model = attempt.debug?.modelName ? ` · ${attempt.debug.modelName}` : "";
  label.textContent = `请求 ${attempt.attempt}${model}${attempt.error ? ` · ${attempt.error}` : ""}`;
  const raw = document.createElement("pre");
  raw.textContent = attempt.rawContent || "（ASAP 未返回正文）";
  container.append(label, raw);
  if (attempt.traceId) {
    const traceId = document.createElement("p");
    traceId.className = "debug-trace-id";
    traceId.textContent = `Trace ID：${attempt.traceId}`;
    container.appendChild(traceId);
  }
}

function projectMessages(snapshot: AgentSessionSnapshot, welcome: string): ChatMessage[] {
  const messages: ChatMessage[] = [{ id: "welcome", role: "assistant", content: welcome }];
  const shown = new Set<string>();
  for (const task of snapshot.tasks) {
    for (const input of task.inputs) {
      if (shown.has(input.id)) continue;
      shown.add(input.id);
      messages.push({ id: input.id, role: "user", content: input.text });
      if (input.error) messages.push({ id: `${input.id}-error`, role: "assistant", content: input.error });
    }
    const current = task.id === snapshot.current?.id;
    const progress = task.progress.at(-1);
    let content = task.outcome?.message ?? "正在处理…";
    if (!task.outcome && progress) {
      if (progress.kind === "model")
        content =
          progress.commentary ?? (progress.decision === "search_tool" ? "正在搜索相关文件内容…" : "正在分析请求");
      if (progress.kind === "recovery") content = recoveryStatus(progress.recovery);
      if (progress.kind === "tool") content = `正在执行工具：${progress.tool}`;
      if (progress.kind === "script") content = "正在执行 Agent Script…";
    }
    if (current && snapshot.state === "preparing") content = "正在准备图片和输入…";
    if (current && snapshot.state === "stopping") content = "正在停止…";
    messages.push({
      id: task.id,
      role: "assistant",
      content,
      pending: current && snapshot.running,
      debugEnabled: !!task.debug,
      debug: task.debug ? (structuredClone(task.debug) as ChatDebugTrace) : undefined
    });
  }
  for (const { input } of snapshot.pendingInputs) {
    if (!shown.has(input.id)) messages.push({ id: input.id, role: "user", content: input.text, pending: true });
  }
  return messages;
}

function getErrorMessage(value: unknown, fallback: string): string {
  return value instanceof Error && value.message ? value.message : fallback;
}
