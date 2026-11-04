import {
  type AgentTraceRecord,
  type AgentTraceSnapshot,
  type ContextCompactionBudget,
  AgentTraceStore,
  CandyJarFileSaveCancelledError,
  saveUtf8FileThroughCandyJar
} from "@galacean/engine-ai-chat/ai-chat/index";
import { resolveCandyJar } from "@galacean/engine-ai-chat/ai-chat/candyjar-bridge";
import { formatContextTrace } from "@galacean/engine-ai-chat/ai-chat/context-trace";
import {
  DEFAULT_SEED_WORLD_ASR_TAIL_TUNING,
  SEED_WORLD_ASR_TAIL_TUNING_LIMITS,
  type SeedWorldAsrTailTuning
} from "./SeedWorldAsrTailTuning.ts";

const PANEL_PREVIEW_CHARACTERS = 120_000;
const BUTTON_FEEDBACK_MILLISECONDS = 1_600;

export interface SeedWorldAgentDebugApi {
  /** In-memory diagnostic override for subsequent submissions; undefined restores server defaults. */
  setContextCompactionBudget(budget: ContextCompactionBudget | undefined): void;
  readonly enabled: boolean;
  readonly traceCount: number;
  enable(): void;
  disable(): void;
  clear(): void;
  getCurrentTrace(): AgentTraceSnapshot | undefined;
  getLastTrace(): AgentTraceRecord | undefined;
  getTraces(): AgentTraceRecord[];
  exportLastTrace(): Promise<string | undefined>;
  exportCurrentTrace(): Promise<string | undefined>;
  copyCurrentTrace(): Promise<boolean>;
  copyLastTrace(): Promise<boolean>;
  downloadCurrentTrace(): Promise<boolean>;
  downloadLastTrace(): Promise<boolean>;
}

export interface SeedWorldAgentDebugController extends SeedWorldAgentDebugApi {
  destroy(): void;
}

export interface SeedWorldAgentDebugOptions {
  setContextCompactionBudget?(budget: ContextCompactionBudget | undefined): void;
  runCommand?(instruction: string): Promise<boolean> | boolean;
  getAsrTailTuning?(): SeedWorldAsrTailTuning;
  setAsrTailTuning?(tuning: SeedWorldAsrTailTuning): SeedWorldAsrTailTuning | undefined;
}

export function createSeedWorldAgentDebug(
  store: AgentTraceStore,
  options: SeedWorldAgentDebugOptions = {}
): SeedWorldAgentDebugController {
  return new SeedWorldAgentDebugSurface(store, options);
}

class SeedWorldAgentDebugSurface implements SeedWorldAgentDebugController {
  private readonly _store: AgentTraceStore;
  private readonly _options: SeedWorldAgentDebugOptions;
  private readonly _unsubscribe: () => void;
  private _root: HTMLDivElement | undefined;
  private _toggle: HTMLButtonElement | undefined;
  private _panel: HTMLDivElement | undefined;
  private _asrTuningInputs: Record<keyof SeedWorldAsrTailTuning, HTMLInputElement> | undefined;
  private _asrTuningButtons: readonly HTMLButtonElement[] = [];
  private _commandInput: HTMLTextAreaElement | undefined;
  private _content: HTMLPreElement | undefined;
  private _draftTraceInteractionId: string | null = null;
  private readonly _buttonFeedbackTimers = new Map<HTMLButtonElement, number>();
  private readonly _preventGameLongPressDefault = (event: Event): void => {
    if (isTraceTextInteractionTarget(event.target)) return;
    event.preventDefault();
  };

  constructor(store: AgentTraceStore, options: SeedWorldAgentDebugOptions) {
    this._store = store;
    this._options = options;
    this._unsubscribe = store.subscribe(() => this._refresh());
    if (store.enabled) this._mount();
  }

  get enabled(): boolean {
    return this._store.enabled;
  }

  setContextCompactionBudget(budget: ContextCompactionBudget | undefined): void {
    if (!this._options.setContextCompactionBudget) throw new Error("Context compaction diagnostics are unavailable");
    this._options.setContextCompactionBudget(budget);
  }

  get traceCount(): number {
    return this._store.size;
  }

  enable(): void {
    this._store.setEnabled(true);
    this._mount();
    this._refresh();
  }

  disable(): void {
    this._store.setEnabled(false);
    this._unmount();
  }

  clear(): void {
    this._store.clear();
  }

  getLastTrace(): AgentTraceRecord | undefined {
    return this._store.getLastTrace();
  }

  getCurrentTrace(): AgentTraceSnapshot | undefined {
    return this._store.getCurrentTrace();
  }

  getTraces(): AgentTraceRecord[] {
    return this._store.getTraces();
  }

  exportLastTrace(): Promise<string | undefined> {
    return this._store.exportLastTrace();
  }

  exportCurrentTrace(): Promise<string | undefined> {
    return this._store.exportCurrentTrace();
  }

  async copyCurrentTrace(): Promise<boolean> {
    return this._copySerializedTrace(this.exportCurrentTrace());
  }

  async copyLastTrace(): Promise<boolean> {
    return this._copySerializedTrace(this.exportLastTrace());
  }

  private async _copySerializedTrace(exportResult: Promise<string | undefined>): Promise<boolean> {
    try {
      const serialized = await exportResult;
      if (!serialized) return false;
      await writeClipboardText(serialized);
      return true;
    } catch (error) {
      console.warn("[seed-world-agent-trace] clipboard write failed", error);
      return false;
    }
  }

  async downloadCurrentTrace(): Promise<boolean> {
    return this._downloadTrace(this.getCurrentTrace(), this.exportCurrentTrace());
  }

  async downloadLastTrace(): Promise<boolean> {
    return this._downloadTrace(this.getLastTrace(), this.exportLastTrace());
  }

  private async _downloadTrace(trace: AgentTraceSnapshot | undefined, exportResult: Promise<string | undefined>): Promise<boolean> {
    try {
      const serialized = await exportResult;
      if (!trace || !serialized) return false;
      const fileName = `seed-world-agent-trace-${safeTimestamp(trace.startedAt)}.json`;
      const candyJar = resolveCandyJar();
      if (candyJar) {
        await saveUtf8FileThroughCandyJar(candyJar, serialized, fileName, "application/json");
      } else {
        downloadThroughDocument(serialized, fileName);
      }
      return true;
    } catch (error) {
      if (error instanceof CandyJarFileSaveCancelledError) return false;
      console.warn("[seed-world-agent-trace] JSON download failed", error);
      return false;
    }
  }

  destroy(): void {
    this._unsubscribe();
    this._unmount();
  }

  private _mount(): void {
    if (this._root || !document.body) return;
    const root = document.createElement("div");
    root.dataset.seedWorldAgentTrace = "true";
    applyStyle(root, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      userSelect: "none",
      webkitUserSelect: "none",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    });
    root.style.setProperty("-webkit-touch-callout", "none");
    root.addEventListener("pointerdown", stopEvent);
    root.addEventListener("pointerup", stopEvent);
    root.addEventListener("keydown", stopEvent);
    root.addEventListener("keyup", stopEvent);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Agent Trace";
    applyStyle(
      toggle,
      buttonStyle({
        position: "absolute",
        top: "calc(10px + var(--seed-world-safe-area-top, 0px))",
        right: "calc(10px + var(--seed-world-safe-area-right, 0px))",
        touchAction: "manipulation"
      })
    );

    const panel = document.createElement("div");
    applyStyle(panel, {
      position: "absolute",
      top: "calc(48px + var(--seed-world-safe-area-top, 0px))",
      right: "calc(10px + var(--seed-world-safe-area-right, 0px))",
      width:
        "min(720px, calc(100vw - 20px - var(--seed-world-safe-area-left, 0px) - var(--seed-world-safe-area-right, 0px)))",
      maxHeight: "calc(100vh - 58px - var(--seed-world-safe-area-top, 0px) - var(--seed-world-safe-area-bottom, 0px))",
      display: "none",
      flexDirection: "column",
      overflow: "hidden",
      color: "#f4f4f5",
      background: "rgba(9, 9, 11, 0.94)",
      border: "1px solid rgba(255, 255, 255, 0.18)",
      borderRadius: "10px",
      boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
      pointerEvents: "auto"
    });

    const toolbar = document.createElement("div");
    applyStyle(toolbar, {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      padding: "8px",
      borderBottom: "1px solid rgba(255, 255, 255, 0.14)"
    });
    const copy = createButton("复制", () => {
      void this._runButtonAction(copy, "复制中…", "已复制", "复制失败", () => this.copyCurrentTrace());
    });
    const download = createButton("下载 JSON", () => {
      void this._runButtonAction(download, "选择保存位置…", "已下载", "下载失败", () => this.downloadCurrentTrace());
    });
    const trajectory = createButton("查轨迹", () => {
      const pageUrl = new URL(window.location.href);
      const trajectoryPath = pageUrl.pathname.includes("/seed-world/dev/planning/")
        ? "../../../agent-trajectory/index.html"
        : "../agent-trajectory/index.html";
      const url = new URL(trajectoryPath, pageUrl);
      window.open(url.href, "_blank", "noopener,noreferrer");
    });
    trajectory.title = "打开 DSH 轨迹页面，可导入复制或下载的 Trace JSON";
    const clear = createButton("清空", () => this.clear());
    const close = createButton("关闭", () => {
      panel.style.display = "none";
    });
    toolbar.append(copy, download, trajectory, clear, close);
    const attachmentNotice = document.createElement("div");
    attachmentNotice.textContent = "截图独立保存到本机附件库，复制/下载时打包。清空仅移除本页记录，附件不自动删除，磁盘占用会累积。分享前请确认内容；每轮最多 2 MiB / 32 张，超限会标记省略。";
    applyStyle(attachmentNotice, { padding: "6px 8px", color: "#ccc", fontSize: "11px" });

    const asrTuningEditor = this._createAsrTuningEditor();
    const commandEditor = document.createElement("div");
    applyStyle(commandEditor, {
      display: "flex",
      gap: "8px",
      alignItems: "stretch",
      padding: "8px",
      borderBottom: "1px solid rgba(255, 255, 255, 0.14)"
    });
    const commandInput = document.createElement("textarea");
    commandInput.rows = 3;
    commandInput.placeholder = "输入指令，或修改最近一次语音识别结果…";
    commandInput.spellcheck = false;
    commandInput.setAttribute("aria-label", "Agent 调试指令");
    applyStyle(commandInput, {
      flex: "1 1 auto",
      minWidth: "0",
      resize: "vertical",
      padding: "8px 10px",
      color: "#fafafa",
      background: "rgba(24, 24, 27, 0.96)",
      border: "1px solid rgba(255, 255, 255, 0.2)",
      borderRadius: "7px",
      outline: "none",
      userSelect: "text",
      webkitUserSelect: "text",
      font: "12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    });
    commandInput.style.setProperty("-webkit-touch-callout", "default");
    const runCommand = createButton("发送", () => {
      void this._executeDraft(runCommand, commandInput);
    });
    applyStyle(runCommand, { alignSelf: "stretch", minWidth: "76px" });
    commandInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      void this._executeDraft(runCommand, commandInput);
    });
    commandEditor.append(commandInput, runCommand);

    const content = document.createElement("pre");
    content.dataset.seedWorldAgentTraceSelectable = "true";
    applyStyle(content, {
      flex: "1 1 auto",
      minHeight: "0",
      margin: "0",
      padding: "12px",
      overflow: "auto",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      fontSize: "11px",
      lineHeight: "1.45",
      userSelect: "text",
      webkitUserSelect: "text"
    });
    content.style.setProperty("-webkit-touch-callout", "default");
    panel.append(toolbar, attachmentNotice);
    if (asrTuningEditor) panel.append(asrTuningEditor);
    panel.append(commandEditor, content);
    root.append(toggle, panel);
    document.body.appendChild(root);
    document.addEventListener("contextmenu", this._preventGameLongPressDefault, true);
    document.addEventListener("selectstart", this._preventGameLongPressDefault, true);
    document.addEventListener("dragstart", this._preventGameLongPressDefault, true);
    toggle.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "flex" : "none";
      this._refresh();
    });
    this._root = root;
    this._toggle = toggle;
    this._panel = panel;
    this._commandInput = commandInput;
    this._content = content;
    this._refresh();
  }

  private _unmount(): void {
    for (const timer of this._buttonFeedbackTimers.values()) window.clearTimeout(timer);
    this._buttonFeedbackTimers.clear();
    document.removeEventListener("contextmenu", this._preventGameLongPressDefault, true);
    document.removeEventListener("selectstart", this._preventGameLongPressDefault, true);
    document.removeEventListener("dragstart", this._preventGameLongPressDefault, true);
    this._root?.remove();
    this._root = undefined;
    this._toggle = undefined;
    this._panel = undefined;
    this._asrTuningInputs = undefined;
    this._asrTuningButtons = [];
    this._commandInput = undefined;
    this._content = undefined;
    this._draftTraceInteractionId = null;
  }

  private _refresh(): void {
    if (this._store.enabled && !this._root) this._mount();
    if (this._toggle) {
      this._toggle.textContent = this._store.running ? "Agent Trace (执行中)" : `Agent Trace (${this._store.size})`;
    }
    this._refreshAsrTuningInputs();
    if (!this._panel || this._panel.style.display === "none") return;
    const latestTrace = this._store.getCurrentTrace();
    const latestInteractionId = latestTrace?.interactionId ?? null;
    if (
      this._commandInput &&
      latestInteractionId !== this._draftTraceInteractionId &&
      document.activeElement !== this._commandInput
    ) {
      this._commandInput.value = latestTrace?.input.text ?? "";
      this._draftTraceInteractionId = latestInteractionId;
    }
    if (!this._content) return;
    // The live panel only renders references; loading image bytes is an explicit export action.
    const traceJson = latestTrace ? JSON.stringify(latestTrace, null, 2) : undefined;
    if (!traceJson) {
      this._content.textContent = "等待下一次 ASR / Agent 任务…";
      return;
    }
    const contextSummary = formatContextTrace(latestTrace?.agentEvents ?? []);
    const serialized = contextSummary ? `${contextSummary}\n\n${traceJson}` : traceJson;
    if (serialized.length <= PANEL_PREVIEW_CHARACTERS) {
      this._content.textContent = serialized;
      return;
    }
    const marker = "\n\n…面板预览已截断中段；保留开头与结尾，完整内容请下载 JSON。\n\n";
    const segmentLength = Math.floor((PANEL_PREVIEW_CHARACTERS - marker.length) / 2);
    this._content.textContent = `${serialized.slice(0, segmentLength)}${marker}${serialized.slice(-segmentLength)}`;
  }

  private _createAsrTuningEditor(): HTMLDivElement | undefined {
    if (!this._options.getAsrTailTuning || !this._options.setAsrTailTuning) return undefined;
    const editor = document.createElement("div");
    applyStyle(editor, {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      alignItems: "end",
      padding: "8px",
      borderBottom: "1px solid rgba(255, 255, 255, 0.14)"
    });
    const title = document.createElement("div");
    title.textContent = "ASR 尾音窗口（ms）";
    applyStyle(title, { flex: "1 0 100%", fontSize: "11px", color: "#d4d4d8" });

    const inputs = {
      minimumMilliseconds: createAsrTuningInput(
        "最短等待",
        "seed-world-asr-tail-minimum",
        SEED_WORLD_ASR_TAIL_TUNING_LIMITS.minimumMilliseconds
      ),
      textSettleMilliseconds: createAsrTuningInput(
        "更新稳定",
        "seed-world-asr-tail-settle",
        SEED_WORLD_ASR_TAIL_TUNING_LIMITS.textSettleMilliseconds
      ),
      maximumMilliseconds: createAsrTuningInput(
        "最长等待",
        "seed-world-asr-tail-maximum",
        SEED_WORLD_ASR_TAIL_TUNING_LIMITS.maximumMilliseconds
      )
    };
    const apply = createButton("应用", () => {
      const applied = this._options.setAsrTailTuning?.(readAsrTuningInputs(inputs));
      if (applied) writeAsrTuningInputs(inputs, applied);
      this._refresh();
    });
    const reset = createButton("恢复默认", () => {
      const applied = this._options.setAsrTailTuning?.(DEFAULT_SEED_WORLD_ASR_TAIL_TUNING);
      if (applied) writeAsrTuningInputs(inputs, applied);
      this._refresh();
    });
    editor.append(
      title,
      inputs.minimumMilliseconds.parentElement!,
      inputs.textSettleMilliseconds.parentElement!,
      inputs.maximumMilliseconds.parentElement!,
      apply,
      reset
    );
    this._asrTuningInputs = inputs;
    this._asrTuningButtons = [apply, reset];
    writeAsrTuningInputs(inputs, this._options.getAsrTailTuning());
    return editor;
  }

  private _refreshAsrTuningInputs(): void {
    const inputs = this._asrTuningInputs;
    const tuning = this._options.getAsrTailTuning?.();
    if (!inputs || !tuning) return;
    const focused = Object.values(inputs).includes(document.activeElement as HTMLInputElement);
    if (!focused) writeAsrTuningInputs(inputs, tuning);
    for (const input of Object.values(inputs)) input.disabled = this._store.running;
    for (const button of this._asrTuningButtons) button.disabled = this._store.running;
  }

  private async _executeDraft(button: HTMLButtonElement, input: HTMLTextAreaElement): Promise<void> {
    const instruction = input.value.trim();
    if (!instruction || button.disabled) return;
    await this._runButtonAction(button, "发送中…", "已发送", "发送失败", async () => {
      const runCommand = this._options.runCommand;
      return runCommand ? Boolean(await runCommand(instruction)) : false;
    });
  }

  private async _runButtonAction(
    button: HTMLButtonElement,
    pendingLabel: string,
    successLabel: string,
    failureLabel: string,
    action: () => Promise<boolean>
  ): Promise<void> {
    const previousTimer = this._buttonFeedbackTimers.get(button);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    button.disabled = true;
    button.textContent = pendingLabel;
    const succeeded = await action();
    button.disabled = false;
    button.textContent = succeeded ? successLabel : failureLabel;
    const timer = window.setTimeout(() => {
      button.textContent = button.dataset.idleLabel ?? "";
      this._buttonFeedbackTimers.delete(button);
    }, BUTTON_FEEDBACK_MILLISECONDS);
    this._buttonFeedbackTimers.set(button, timer);
  }
}

function createAsrTuningInput(
  labelText: string,
  id: string,
  limits: Readonly<{ minimum: number; maximum: number }>
): HTMLInputElement {
  const label = document.createElement("label");
  label.htmlFor = id;
  applyStyle(label, {
    display: "flex",
    flex: "1 1 110px",
    minWidth: "96px",
    flexDirection: "column",
    gap: "4px",
    fontSize: "10px",
    color: "#a1a1aa"
  });
  label.append(labelText);
  const input = document.createElement("input");
  input.id = id;
  input.type = "number";
  input.min = String(limits.minimum);
  input.max = String(limits.maximum);
  input.step = "100";
  input.inputMode = "numeric";
  applyStyle(input, {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 8px",
    color: "#fafafa",
    background: "rgba(24, 24, 27, 0.96)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "7px",
    outline: "none",
    font: "600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  });
  label.append(input);
  return input;
}

function readAsrTuningInputs(inputs: Record<keyof SeedWorldAsrTailTuning, HTMLInputElement>): SeedWorldAsrTailTuning {
  return {
    minimumMilliseconds: Number(inputs.minimumMilliseconds.value),
    textSettleMilliseconds: Number(inputs.textSettleMilliseconds.value),
    maximumMilliseconds: Number(inputs.maximumMilliseconds.value)
  };
}

function writeAsrTuningInputs(
  inputs: Record<keyof SeedWorldAsrTailTuning, HTMLInputElement>,
  tuning: SeedWorldAsrTailTuning
): void {
  inputs.minimumMilliseconds.value = String(tuning.minimumMilliseconds);
  inputs.textSettleMilliseconds.value = String(tuning.textSettleMilliseconds);
  inputs.maximumMilliseconds.value = String(tuning.maximumMilliseconds);
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.idleLabel = label;
  applyStyle(button, buttonStyle());
  button.addEventListener("click", onClick);
  return button;
}

function buttonStyle(extra: Partial<CSSStyleDeclaration> = {}): Partial<CSSStyleDeclaration> {
  return {
    appearance: "none",
    padding: "7px 10px",
    color: "#fafafa",
    background: "rgba(39, 39, 42, 0.96)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "7px",
    font: "600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    cursor: "pointer",
    pointerEvents: "auto",
    userSelect: "none",
    webkitUserSelect: "none",
    ...extra
  };
}

function isTraceTextInteractionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('textarea, input, select, [data-seed-world-agent-trace-selectable="true"]'));
}

function applyStyle(element: HTMLElement, style: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, style);
}

function stopEvent(event: Event): void {
  event.stopPropagation();
}

function safeTimestamp(value: string): string {
  return value.replaceAll(":", "-").replaceAll(".", "-");
}

async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Sandboxed Flash App iframes commonly do not receive clipboard-write delegation.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  applyStyle(textarea, {
    position: "fixed",
    inset: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none"
  });
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Browser clipboard API and selection fallback are unavailable");
}

function downloadThroughDocument(serialized: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  queueMicrotask(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  });
}
