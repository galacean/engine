import { HUD_REFERENCE_SHORT_SIDE, resolveSeedWorldHudScale } from "../src/SeedWorldHudLayout.ts";
import { SeedWorldSessionActivity, readTraceWorldSnapshot } from "./SeedWorldSessionActivity.ts";
import { SeedWorldCameraButton } from "../src/SeedWorldCameraButton.ts";
import { SeedWorldTranscriptScroll } from "./SeedWorldTranscriptScroll.ts";
import { composeAgentConfiguration, type AgentEditorExtension } from "@galacean/engine-ai-chat/ai-chat/agent-extensions";
import type { ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import { createContextCompactionRequest, type ContextCompactionBudget } from "@galacean/engine-ai-chat/ai-chat/context-compaction";
import {
  Camera,
  Color,
  Engine,
  Entity,
  Material,
  Matrix,
  Vector4,
  OverflowMode,
  PointerEventData,
  PointerPhase,
  Script,
  Shader,
  Sprite,
  TextHorizontalAlignment,
  TextVerticalAlignment,
  Texture2D,
  TextureFormat,
  TextUtils
} from "@galacean/engine";
import {
  Button,
  CanvasRenderMode,
  HorizontalAlignmentMode,
  Image,
  ResolutionAdaptationMode,
  Text,
  UICanvas,
  UITransform,
  VerticalAlignmentMode
} from "@galacean/engine-ui";
import {
  AgentCancelledError,
  getAgentTaskFailure,
  AgentLoop,
  AgentTraceStore,
  AIChatSession,
  AsapRateLimitError,
  createAsrClient,
  type AgentSessionSnapshot,
  type AgentInputSource,
  type AgentInputTarget,
  type AgentValue,
  type AgentTraceAsr,
  type AsrClient,
  type AsrError,
  type AsrSession,
  type AsrSessionOutcome,
  type AsrTextPayload
} from "@galacean/engine-ai-chat/ai-chat/index";
import { createSeedWorldAgentDefinition } from "../agent-adapter/SeedWorldAgentDefinition.ts";
import type { SeedWorldAgentApplication } from "../agent-adapter/SeedWorldAgentApplication.ts";
import { createSeedWorldTools } from "../agent-adapter/SeedWorldToolCatalog.ts";
import { SEED_WORLD_MODEL } from "./SeedWorldModel.ts";
import {
  createSeedWorldAgentDebug,
  type SeedWorldAgentDebugApi,
  type SeedWorldAgentDebugController
} from "./SeedWorldAgentDebug.ts";
import {
  loadSeedWorldAsrTailTuning,
  resolveSeedWorldAsrTailDeadlineMilliseconds,
  saveSeedWorldAsrTailTuning,
  type SeedWorldAsrTailTuning
} from "./SeedWorldAsrTailTuning.ts";
import {
  SEED_WORLD_WORKING_TEXT_SHADER_NAME,
  SEED_WORLD_VOICE_ORB_SHADER_NAME,
  SeedWorldLiquidGlassUiMaterial,
  seedWorldWorkingTextShaderSource,
  seedWorldVoiceOrbShaderSource
} from "./SeedWorldVoiceHudShaders.ts";

import { projectSeedWorldTask } from "./SeedWorldTaskPresentation.ts";
import { SeedWorldTurnGesture, turnDragIntent, TURN_DISMISS_DISTANCE, turnAnchorOffset, turnThrow } from "./SeedWorldTurnGesture.ts";

// Galacean's dynamic font atlas rasterizes glyphs at Text.fontSize, without
// multiplying by the output device pixel ratio. Author the HUD at 2x and let
// the canvas scale it back to its original visual size so glyph texels stay
// one-to-one with the DPR=2 output backbuffer instead of being bilinear-upscaled.
const HUD_RASTER_SCALE = 2;
const HUD_VISUAL_SCALE = 0.5;
const hudUnits = (designPixels: number): number => designPixels * HUD_RASTER_SCALE * HUD_VISUAL_SCALE;
// FreeControl's dynamic joystick renders at 32_000. The voice surface is the
// foreground HUD interaction and must win both overlay rendering and UI raycast.
const VOICE_HUD_SORT_ORDER = 64_000;
const ORB_SIZE = hudUnits(106);
// Visual scaling may resize the control, but it must not consume the bottom
// interaction clearance. Keep the authored 30 px inset in raster-space units.
const ORB_BOTTOM = 30 * HUD_RASTER_SCALE;
const PANEL_BOTTOM = ORB_BOTTOM + ORB_SIZE + hudUnits(20);
const PANEL_TOP_MARGIN = hudUnits(22);
const PANEL_MAX_HEIGHT = hudUnits(720) - PANEL_BOTTOM - PANEL_TOP_MARGIN;
const PANEL_MAX_WIDTH = hudUnits(560);
const PANEL_MIN_WIDTH = hudUnits(260);
const PANEL_HORIZONTAL_MARGIN = hudUnits(22);
const TRANSCRIPT_HORIZONTAL_PADDING = hudUnits(28);
const TRANSCRIPT_VERTICAL_PADDING = hudUnits(20);
const TRANSCRIPT_FOOTER_HEIGHT = hudUnits(26);
const TASK_CONTROL_SIZE = hudUnits(48);
const TASK_CONTROL_INSET = hudUnits(10);
const TASK_CONTROL_SPACE = TASK_CONTROL_SIZE + TASK_CONTROL_INSET;
const RESULT_VISIBLE_MILLISECONDS = 9_000;
const BRIEF_FEEDBACK_VISIBLE_MILLISECONDS = 650;
const ASR_ERROR_VISIBLE_MILLISECONDS = 5_000;
const MINIMUM_SPEECH_HOLD_MILLISECONDS = 1_000;
const MAX_ASR_INTERACTION_TRACE_EVENTS = 48;
/**
 * A Seed World script may traverse a transport-bounded world.query cursor and
 * inspect one representative asset per discovered kind. Keep this domain
 * budget above the complete current-world traversal cost while retaining the
 * generic AgentLoop budget as a finite safety boundary.
 */
const SEED_WORLD_MAX_TOOL_CALLS_PER_SCRIPT = 128;
const PANEL_FADE_IN_SECONDS = 0.22;
const PANEL_FADE_OUT_SECONDS = 0.32;
const BRIEF_FEEDBACK_FADE_OUT_SECONDS = 0.14;
const SYSTEM_TEXT_COLOR = new Color(1, 1, 1, 1);
const CONTENT_TEXT_COLOR = new Color(1, 1, 1, 1);
const CHAT_DISPLAY_EMOJI_GRAPHEME_PATTERN =
  /[\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}\u20e3\ufe0f]/u;
const chatDisplayGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Removes complete emoji graphemes only from text headed to Galacean's chat Text renderer. */
export function stripSeedWorldChatDisplayEmoji(text: string): string {
  let displayText = "";
  for (const { segment } of chatDisplayGraphemeSegmenter.segment(text)) {
    if (CHAT_DISPLAY_EMOJI_GRAPHEME_PATTERN.test(segment)) {
      continue;
    }
    displayText += segment;
  }
  return displayText;
}

export interface SeedWorldChatPanelOptions {
  readonly observeViewWithPointer?: (signal: AbortSignal) => Promise<import("@galacean/engine-ai-chat/ai-chat/agent-types").AgentViewObservation>;
  readonly editorExtensions?: readonly AgentEditorExtension[];
  readonly nativeEditor?: RuntimeNativeEditor;
  readonly projectFiles?: readonly ProjectFileProvider[];
  readonly application: SeedWorldAgentApplication;
  readonly engine: Engine;
  readonly camera: Camera;
  readonly root: Entity;
  readonly setWorldInputEnabled: (enabled: boolean) => void;
  readonly initiallyOpen?: boolean;
  readonly traceEnabled?: boolean;
}

/** Pure Galacean UI voice surface backed by one persistent Agent session. */
export interface SeedWorldChatPanel {
  readonly application: SeedWorldAgentApplication;
  readonly session: AIChatSession;
  readonly root: Entity;
  readonly debug: SeedWorldAgentDebugApi;
  readonly listening: boolean;
  readonly busy: boolean;
  mountScreenshotButton(button: HTMLButtonElement, canvas: HTMLCanvasElement, onLayout: (x: number, top: number, visible: boolean) => void): void;
  show(): void;
  hide(): void;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  submit(text: string, inputSource?: AgentInputSource, target?: AgentInputTarget): Promise<void>;
  stop(): Promise<void>;
  continue(): Promise<void>;
  destroy(): void;
}

type VoiceHudTextTone = "system" | "content";
type FeedbackCategory = "invalid-speech" | "asr-unavailable" | "asr-error" | "task-result" | "task-error";
interface FeedbackDismissPolicy {
  readonly visibleMilliseconds: number;
  readonly fadeOutSeconds: number;
}

interface VoiceAttempt {
  readonly session: AsrSession;
  readonly interaction: VoiceInteractionTrace;
  readonly startedAt: string;
  readonly startedAtMilliseconds: number;
  readonly tailTuning: SeedWorldAsrTailTuning;
  readonly transcripts: Array<{
    elapsedMilliseconds: number;
    text: string;
    seq?: number;
    isFinal?: boolean;
    phase: "before-release" | "after-release-before-stop" | "after-stop";
  }>;
  released: boolean;
  transcript: string;
  listeningStartedAtMilliseconds?: number;
  releasedAtMilliseconds?: number;
  tailWindowStartedAtMilliseconds?: number;
  tailWindowEndedAtMilliseconds?: number;
  stopRequestedAtMilliseconds?: number;
  lastTranscriptAtMilliseconds?: number;
  lastTranscriptIsFinal?: boolean;
  textAtRelease?: string;
  textAtStop?: string;
  endedAtMilliseconds?: number;
  endReason?: string;
  sessionId?: string;
  traceInteractionId?: string;
  traceRecorded: boolean;
  error?: AsrError;
  completionPromise?: Promise<void>;
}

type VoiceInteractionTraceEvent = NonNullable<AgentTraceAsr["interactionEvents"]>[number];

interface VoiceInteractionTrace {
  readonly startedAt: string;
  readonly startedAtMilliseconds: number;
  readonly pointerId?: number;
  readonly events: VoiceInteractionTraceEvent[];
  interrupted: boolean;
  interruptionReason?: string;
}

type AssistantState =
  | { kind: "idle" }
  | { kind: "voice"; phase: "starting"; attempt: VoiceAttempt }
  | { kind: "voice"; phase: "listening"; attempt: VoiceAttempt; startedAtMilliseconds: number }
  | { kind: "voice"; phase: "recognizing"; attempt: VoiceAttempt }
  | { kind: "agent"; task: string }
  | {
      kind: "feedback";
      category: FeedbackCategory;
      message: string;
      tone: VoiceHudTextTone;
    };

/** Mounts voice interaction without DOM layout, text, hit testing, or controls. */
export function mountSeedWorldChatPanel(options: SeedWorldChatPanelOptions): SeedWorldChatPanel {
  const baseDefinition = createSeedWorldAgentDefinition(options.application, options.nativeEditor);
  const baseTools = [...createSeedWorldTools(options.application), ...(options.nativeEditor?.tools ?? [])];
  baseDefinition.projectFiles = [...(baseDefinition.projectFiles ?? []), ...(options.projectFiles ?? [])];
  baseDefinition.supportsViewPointer = Boolean(options.observeViewWithPointer);
  baseDefinition.observeView = async signal => {
    signal.throwIfAborted();
    return options.observeViewWithPointer ? options.observeViewWithPointer(signal) : options.application.requireViewSnapshots().observe(signal);
  };
  baseDefinition.imageResources = options.application.viewSnapshots;
  const configuration = composeAgentConfiguration({ definition: baseDefinition, tools: baseTools }, options.editorExtensions ?? []);
  const session = new AIChatSession({
    agent: new AgentLoop({
      ...configuration,
      maxToolCallsPerScript: SEED_WORLD_MAX_TOOL_CALLS_PER_SCRIPT,
      // Allow a 60s environment transition followed by the bounded 70s IBL publication wait.
      scriptTimeoutMs: 150_000
    })
  });
  let asrTailTuning = loadSeedWorldAsrTailTuning();
  const traceStore = new AgentTraceStore({
    enabled: options.traceEnabled,
    maxRecords: 20,
    sessionStorageKey: "seed-world-agent-traces-v1"
  });
  let controller: SeedWorldVoiceHudController | undefined;
  const debug = createSeedWorldAgentDebug(traceStore, {
    setContextCompactionBudget: budget => {
      if (!controller) throw new Error("Seed World AI is not ready");
      controller.setContextCompactionBudget(budget);
    },
    runCommand: (instruction) => {
      if (!controller) return false;
      void controller.submit(instruction, "text");
      return true;
    },
    getAsrTailTuning: () => asrTailTuning,
    setAsrTailTuning: (tuning) => {
      if (controller?.busy) return undefined;
      asrTailTuning = saveSeedWorldAsrTailTuning(tuning);
      return asrTailTuning;
    }
  });
  // The controller starts and settles traces at task boundaries, including queued turns.
  const resources = createVoiceHudResources(options.engine, options.camera);
  const view = createVoiceHudView(options, resources);
  controller = new SeedWorldVoiceHudController(
    options,
    session,
    view,
    new SeedWorldSessionActivity(session, options.application, traceStore),
    debug,
    () => asrTailTuning
  );
  view.orbEntity.addComponent(VoiceOrbPointer).controller = controller;
  view.layout.controller = controller;
  view.root.isActive = options.initiallyOpen !== false;
  return controller;
}

interface VoiceHudResources {
  readonly whiteTexture: Texture2D;
  readonly whiteSprite: Sprite;
  readonly controlGlass: SeedWorldLiquidGlassUiMaterial;
  readonly stopSprite: Sprite;
  readonly retrySprite: Sprite;
  readonly panelGlass: SeedWorldLiquidGlassUiMaterial;
  readonly orbGlass: SeedWorldLiquidGlassUiMaterial;
  readonly orbMaterial: Material;
  readonly transcriptMaterial: Material;
  destroy(): void;
}

interface VoiceHudView {
  readonly root: Entity;
  readonly orbEntity: Entity;
  readonly transcript: Text;
  readonly orbMaterial: Material;
  readonly transcriptMaterial: Material;
  readonly layout: VoiceHudLayout;
  readonly resources: VoiceHudResources;
  readonly controlButton: VoiceTaskButton;
  readonly controlImage: Image;
  readonly controlIcon: Image;
  readonly pendingLabel?: Text;
}

/** @internal Exported so the voice lifecycle can be exercised without mounting the Galacean HUD. */
export class SeedWorldVoiceHudController implements SeedWorldChatPanel {
  readonly application: SeedWorldAgentApplication;
  readonly session: AIChatSession;
  readonly root: Entity;
  readonly debug: SeedWorldAgentDebugApi;

  private readonly _options: SeedWorldChatPanelOptions;
  private readonly _view: VoiceHudView;
  private readonly _traceStore: AgentTraceStore;
  private readonly _debugController: SeedWorldAgentDebugController;
  private readonly _asrClient: AsrClient;
  private readonly _unsubscribeAsrDiagnostics: () => void;
  private _state: AssistantState = { kind: "idle" };
  private _dismissedPresentationId?: string;
  private _presentedTaskId?: string;
  private get _agentPresentation(): AssistantState | undefined {
    const snapshot = this.session.snapshot;
    if (!snapshot.current || (!snapshot.running && snapshot.current.id === this._dismissedPresentationId)) return;
    const { text } = projectSeedWorldTask(snapshot);
    if (!text) return;
    return snapshot.running ? { kind: "agent", task: text }
      : { kind: "feedback", category: snapshot.current.outcome?.status === "completed" ? "task-result" : "task-error",
          message: text, tone: "content" };
  }
  private _transcriptOwnsWorldInput = false;
  private _turnRevision = 0;
  private _turnHidden = false;
  private _taskOwnsWorldInput = false;
  private readonly _unsubscribeSession: () => void;
  private _pressPointerId: number | undefined;
  private _destroyed = false;
  private _contextCompactionBudget: ContextCompactionBudget | undefined;
  private _screenshotLayout?: () => void;
  private _unmountScreenshot?: () => void;
  private _voiceOwnsWorldInput = false;
  private _resultTimer: number | undefined;
  private _asrCleanupPromise: Promise<void> | undefined;
  private _tracedVoiceAttempt: VoiceAttempt | undefined;
  private _pendingVoiceInteraction: VoiceInteractionTrace | undefined;
  // Native permission prompts blur and later refocus the WebView without
  // leaving the application. Treat those events as diagnostics, not as proof
  // that the user abandoned the active microphone session.
  private readonly _onWindowBlur = () => {
    this._view.controlButton.cancelGesture();
    this._view.layout.cancelReading();
    this._handlePageLifecycleEvent("window.blur", false);
  };
  private readonly _onWindowFocus = () => this._handlePageLifecycleEvent("window.focus", false);
  private readonly _onVisibilityChange = () => {
    const hidden = document.visibilityState !== "visible";
    if (hidden) { this._view.controlButton.cancelGesture(); this._view.layout.cancelReading(); }
    this._handlePageLifecycleEvent(hidden ? "document.hidden" : "document.visible", hidden);
  };

  constructor(
    options: SeedWorldChatPanelOptions,
    session: AIChatSession,
    view: VoiceHudView,
    private readonly _activity: SeedWorldSessionActivity,
    debugController: SeedWorldAgentDebugController,
    private readonly _getAsrTailTuning: () => SeedWorldAsrTailTuning,
    asrClient: AsrClient = createAsrClient()
  ) {
    this.application = options.application;
    this.session = session;
    this.root = view.root;
    this.debug = debugController;
    this._options = options;
    this._view = view;
    this._traceStore = _activity.trace;
    this._debugController = debugController;
    this._asrClient = asrClient;
    this._unsubscribeAsrDiagnostics = this._asrClient.subscribeDiagnostics((diagnostics) => {
      if (this._tracedVoiceAttempt) this._updateAsrTrace(this._tracedVoiceAttempt, diagnostics);
    });
    window.addEventListener("blur", this._onWindowBlur);
    window.addEventListener("focus", this._onWindowFocus);
    document.addEventListener("visibilitychange", this._onVisibilityChange);
    view.controlButton.begin = () => this.beginTaskControlGesture();
    view.controlButton.release = () => {
      this._taskOwnsWorldInput = false;
      if (!this._voiceOwnsWorldInput && !this._transcriptOwnsWorldInput) this._options.setWorldInputEnabled(true);
    };
    view.layout.onReadInteraction = active => {
      this._transcriptOwnsWorldInput = active;
      if (active) this._options.setWorldInputEnabled(false);
      else if (!this._voiceOwnsWorldInput && !this._taskOwnsWorldInput) this._options.setWorldInputEnabled(true);
      this._syncTaskFeedbackDismiss();
    };
    const restartFeedbackTimer = () => {
      if (this._state.kind !== "feedback" || (this._state.category !== "task-result" && this._state.category !== "task-error")) return;
      this._clearResultTimer();
      this._syncTaskFeedbackDismiss();
    };
    view.layout.onExpandedChange = restartFeedbackTimer;
    view.layout.onReadActivity = restartFeedbackTimer;
    view.layout.onHoverChange = restartFeedbackTimer;
    this._updateControls();
    this._transition({ kind: "idle" });
    this._unsubscribeSession = session.subscribeState(snapshot => this._renderSession(snapshot));
  }

  get listening(): boolean {
    return this._state.kind === "voice" && this._state.phase !== "recognizing";
  }

  get busy(): boolean {
    return this.session.running || this._isInteractionBusy() || this._asrCleanupPromise !== undefined;
  }

  /** Keep capture controls and the photo dock attached to the native voice HUD. */
  mountScreenshotButton(button: HTMLButtonElement, canvas: HTMLCanvasElement, onLayout: (x: number, top: number, visible: boolean) => void): void {
    this._unmountScreenshot?.();
    const cameraButton = new SeedWorldCameraButton(this._options.camera, button);
    const updateAnchor = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = resolveSeedWorldHudScale(rect.width, rect.height);
      onLayout(rect.left + rect.width / 2, rect.bottom - this._view.layout.photoDockBottom * scale, this.root.isActive);
    };
    this._view.layout.onPhotoDockLayout = updateAnchor;
    const layout = this._screenshotLayout = () => {
      button.hidden = !this.root.isActive;
      button.style.display = this.root.isActive ? "inline-flex" : "none";
      button.disabled = this._state.kind === "voice" || this.session.running;
      updateAnchor();
    };
    const observer = new ResizeObserver(layout);
    observer.observe(canvas);
    window.addEventListener("resize", layout);
    this._unmountScreenshot = () => {
      this._view.layout.onPhotoDockLayout = undefined;
      observer.disconnect();
      window.removeEventListener("resize", layout);
      cameraButton.dispose();
      button.remove();
    };
    layout();
  }

  show(): void {
    if (!this._destroyed) { this.root.isActive = true; this._screenshotLayout?.(); }
  }

  hide(): void {
    if (this._destroyed) return;
    this._clearResultTimer();
    this._view.controlButton.cancelGesture();
    this._view.layout.cancelReading();
    this.session.cancel();
    this._cancelListening();
    this._view.layout.hidePanelImmediately();
    this.root.isActive = false;
    this._screenshotLayout?.();
  }

  async startListening(): Promise<void> {
    await this._waitForAsrCleanup();
    if (this._destroyed || this._isVoiceInteractionBusy()) return;
    const interaction = this._pendingVoiceInteraction ?? this._createVoiceInteraction();
    if (!this._pendingVoiceInteraction) {
      this._pendingVoiceInteraction = interaction;
      this._recordVoiceInteractionEvent(interaction, "controller.start_requested");
    }
    this._clearResultTimer();
    this._captureWorldInputForVoice();
    let attempt: VoiceAttempt | undefined;
    try {
      const asrSession = this._asrClient.start({
        lang: "zh-CN",
        interim: true,
        onText: (payload) => {
          if (attempt) this._handleAsrText(attempt, payload);
        }
      });
      attempt = this._createVoiceAttempt(asrSession, interaction);
      if (this._pendingVoiceInteraction === interaction) this._pendingVoiceInteraction = undefined;
      this._recordVoiceInteractionEvent(interaction, "asr.session_created", {}, attempt);
      attempt.traceInteractionId = this.session.running ? undefined : this._traceStore.begin({
        input: "",
        inputSource: "voice",
        asr: createAsrTrace(attempt, this._asrClient.getDiagnostics()),
        worldBefore: this._traceStore.enabled ? readTraceWorldSnapshot(this.application) : undefined
      });
      this._tracedVoiceAttempt = attempt;
      void asrSession.released.then(() => {
        this._recordVoiceInteractionEvent(interaction, "asr.session_released", {}, attempt);
      });
      if (
        interaction.interrupted ||
        (interaction.pointerId !== undefined && this._pressPointerId !== interaction.pointerId)
      ) {
        this._recordVoiceInteractionEvent(interaction, "interaction.cancelled_before_ready", {}, attempt);
        this._abortAndTrackAsrCleanup(attempt);
        return;
      }
      this._transition({ kind: "voice", phase: "starting", attempt });
      void asrSession.done.then((outcome) => {
        if (!attempt || !this._isCurrentVoiceAttempt(attempt)) return;
        this._applyAsrOutcome(attempt, outcome);
        if (!attempt.released && outcome.status === "failed") {
          this._completeAsrFailure(attempt, outcome.error);
        }
      });
      await asrSession.ready;
      if (!this._isCurrentVoiceAttempt(attempt)) return;
      if (this._state.kind !== "voice" || this._state.phase !== "starting") return;
      this._recordVoiceInteractionEvent(interaction, "asr.ready", {}, attempt);
      const startedAtMilliseconds = performance.now();
      attempt.listeningStartedAtMilliseconds = startedAtMilliseconds;
      this._updateAsrTrace(attempt);
      this._transition({ kind: "voice", phase: "listening", attempt, startedAtMilliseconds });
    } catch (error) {
      if (!attempt) {
        if (this._pendingVoiceInteraction === interaction) this._pendingVoiceInteraction = undefined;
        this._recordVoiceInteractionEvent(interaction, "asr.start_failed");
        this._traceStore.recordAsrRejection({
          asr: createFailedAsrTrace(error, this._asrClient.getDiagnostics(), interaction),
          error
        });
        this._pressPointerId = undefined;
        this._releaseWorldInputForVoice();
        this._showFeedback("asr-error", "语音识别失败，请重试。");
        return;
      }
      if (!this._isCurrentVoiceAttempt(attempt)) return;
      const outcome = await attempt.session.done;
      if (outcome.status === "failed") this._completeAsrFailure(attempt, outcome.error);
    }
  }

  async stopListening(): Promise<void> {
    if (this._destroyed) return;
    this._releaseWorldInputForVoice();
    if (this._state.kind !== "voice") return;
    const state = this._state;
    const attempt = state.attempt;
    attempt.released = true;
    attempt.releasedAtMilliseconds ??= performance.now();
    attempt.textAtRelease ??= attempt.transcript;
    this._updateAsrTrace(attempt);
    if (state.phase === "recognizing") return attempt.completionPromise;
    const pressDurationMilliseconds = performance.now() - attempt.startedAtMilliseconds;
    if (state.phase === "starting") {
      this._rejectSpeechAttempt(
        attempt,
        pressDurationMilliseconds < MINIMUM_SPEECH_HOLD_MILLISECONDS ? "说话时间太短" : "未识别到文字"
      );
      return;
    }
    const listeningDurationMilliseconds =
      performance.now() - (attempt.listeningStartedAtMilliseconds ?? attempt.startedAtMilliseconds);
    if (listeningDurationMilliseconds < MINIMUM_SPEECH_HOLD_MILLISECONDS) {
      this._rejectSpeechAttempt(attempt, "说话时间太短");
      return;
    }
    this._transition({ kind: "voice", phase: "recognizing", attempt });
    const completionPromise = this._finishRecognition(attempt).finally(() => {
      if (attempt.completionPromise === completionPromise) attempt.completionPromise = undefined;
    });
    attempt.completionPromise = completionPromise;
    return completionPromise;
  }

  setContextCompactionBudget(budget: ContextCompactionBudget | undefined): void {
    if (this.busy || this._destroyed) throw new Error("Cannot change context compaction budget while busy or destroyed");
    createContextCompactionRequest(budget);
    this._contextCompactionBudget = budget === undefined ? undefined : structuredClone(budget);
  }

  async stop(): Promise<void> {
    this._cancelListening();
    await this.session.stop();
  }

  async continue(): Promise<void> {
    if (this._destroyed) return;
    let submission;
    try { submission = await this.session.continue(); }
    catch (error) {
      // Only command admission can fail here (including after the stop barrier).
      if (!this._destroyed && !(error instanceof AgentCancelledError)) {
        this._showFeedback("task-error", resolveTaskErrorMessage(error));
      }
      return;
    }
    // Completion is observable to callers; Session snapshots alone render its result.
    await submission.completion.catch(() => undefined);
  }

  async submit(
    text: string,
    inputSource: AgentInputSource = "text",
    target: AgentInputTarget = "next-step",
    asr?: AgentTraceAsr,
    activeTraceInteractionId?: string
  ): Promise<void> {
    const task = text.trim();
    if (!task || this._destroyed) return;
    const selection = structuredClone(this.application.getUserSelection());
    const viewer = this.application.getViewerSnapshot();
    const attachment = this.application.viewSnapshots?.acquireAttachments();

    try {
      this._clearResultTimer();
      const completion = this._activity.submit(task, {
        ...(this._contextCompactionBudget ? { contextCompaction: this._contextCompactionBudget } : {}),
        model: SEED_WORLD_MODEL,
        context: { user_selection_at_submission: attachment || !selection ? null
          : "component" in selection ? { component: { ...selection.component } } : { ...selection },
          viewer_at_submission: viewer as unknown as AgentValue },
        debugMode: this._traceStore.enabled,
        inputSource
      }, target, {
        prepare: async signal => {
          await this._waitForAsrCleanup();
          signal.throwIfAborted();
          return await attachment?.export() ?? [];
        },
        release: () => attachment?.release()
      }, { asr, id: activeTraceInteractionId }).completion;
      if (this._state.kind === "voice") this._transition(this._agentPresentation ?? { kind: "idle" });
      try { await completion; }
      catch (error) {
        if (!(error instanceof AgentCancelledError) && !this._destroyed) {
          console.error("[seed-world-planner] AI task failed", error);
        }
      }
    } catch (error) {
      if (!this._destroyed && !(error instanceof AgentCancelledError)) {
        console.error("[seed-world-planner] Photo submission failed", error);
        this._showFeedback("task-error", resolveTaskErrorMessage(error));
      }
    }
  }

  private _renderSession(snapshot: AgentSessionSnapshot): void {
    if (this._destroyed) return;
    if (snapshot.current?.id !== this._presentedTaskId) {
      this._presentedTaskId = snapshot.current?.id;
      this._turnRevision++;
      this._turnHidden = false;
      this._clearResultTimer();
      this._view.controlButton.cancelGesture();
      this._view.layout.resetTranscript();
      this._view.layout.resetPanelPosition();
    }
    const presentation = projectSeedWorldTask(snapshot);
    this._view.layout.setTranscriptDetails(stripSeedWorldChatDisplayEmoji(presentation.details));
    if (this._state.kind !== "voice" && this._pressPointerId === undefined) {
      const state = this._agentPresentation ?? { kind: "idle" as const };
      if (state.kind !== "idle" || this._state.kind !== "idle") this._transition(state);
    }
    this._updateControls();
    this._screenshotLayout?.();
  }

  private _updateControls(): void {
    const running = this.session.running;
    const visible = !this._turnHidden && this._state.kind !== "voice" && this._pressPointerId === undefined && (running || this.session.canContinue || this.session.continuationBlocked);
    if (!visible || this.session.state === "stopping") this._view.controlButton.cancelGesture();
    const dismissing = this._view.layout.dismissing;
    this._view.controlButton.entity.isActive = visible || dismissing;
    this._view.controlButton.interactive = visible && (running || this.session.canContinue) && this.session.state !== "stopping";
    if (!dismissing) {
      this._view.controlIcon.sprite = running ? this._view.resources.stopSprite : this._view.resources.retrySprite;
      this._view.controlImage.color.set(1, running ? 0.52 : 0.87, running ? 0.55 : 0.42, 1);
      const iconOpacity = this.session.state === "stopping" || this.session.continuationBlocked ? 0.4 : 1;
      this._view.controlIcon.color.set(running ? 0.95 : 0.88, running ? 0.12 : 0.59, running ? 0.18 : 0.02, iconOpacity);
      this._view.layout.setControlIconOpacity(iconOpacity);
    }
    this._view.layout.setControlVisible(visible);
    if (this._view.pendingLabel) {
      const count = this.session.pendingInputs.length;
      this._view.pendingLabel.text = count ? `待处理 ${count}` : "";
      this._view.pendingLabel.entity.isActive = count > 0;
    }
  }

  /** Captures intent and turn ownership on down; execution happens only on release. */
  beginTaskControlGesture(): { click(): void; dismiss(): void } | undefined {
    if (this._destroyed || this._turnHidden || this._state.kind === "voice" || this._transcriptOwnsWorldInput || this.session.state === "stopping") return;
    const running = this.session.running;
    if (!running && !this.session.canContinue) return;
    const revision = this._turnRevision;
    this._view.layout.cancelReading();
    this._taskOwnsWorldInput = true;
    this._options.setWorldInputEnabled(false);
    const valid = () => !this._destroyed && revision === this._turnRevision && !this._turnHidden;
    return {
      click: () => {
        if (!valid()) return;
        if (running && this.session.canStop) void this.stop();
        else if (!running && !this.session.running && this.session.canContinue) void this.continue();
      },
      dismiss: this.beginTurnDismissGesture()!
    };
  }

  /** Captured on press, valid only for this visible turn. Completed turns can also be discarded. */
  beginTurnDismissGesture(): (() => void) | undefined {
    if (this._destroyed || this._turnHidden || this._pressPointerId !== undefined
      || this._state.kind === "voice" || (this._state.kind === "idle" && !this.session.running && !this.session.canContinue)) return;
    const revision = this._turnRevision;
    return () => {
      if (this._destroyed || revision !== this._turnRevision || this._turnHidden) return;
      this._turnHidden = true;
      this._clearResultTimer();
      this._view.layout.setPanelVisible(false, 0.22);
      this._updateControls();
      if (this.session.canStop) void this.stop();
    };
  }

  destroy(): void {
    if (this._destroyed) return;
    this._view.controlButton.cancelGesture();
    this._view.layout.cancelReading();
    this._destroyed = true;
    this._unmountScreenshot?.();
    this._unmountScreenshot = this._screenshotLayout = undefined;
    window.removeEventListener("blur", this._onWindowBlur);
    window.removeEventListener("focus", this._onWindowFocus);
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    this._clearResultTimer();
    this._unsubscribeSession();
    this._unsubscribeAsrDiagnostics();
    this._debugController.destroy();
    this._cancelListening();
    this._asrClient.destroy();
    this._view.layout.controller = undefined;
    this.root.destroy();
    this._view.resources.destroy();
  }

  handlePointerDown(pointerId: number): void {
    if (this._destroyed || this._pressPointerId !== undefined || this._state.kind === "voice") {
      return;
    }
    this._view.layout.cancelReading();
    this._pressPointerId = pointerId;
    this._clearResultTimer();
    this._view.layout.setPresentation("voice");
    this._setTranscript("我在听");
    this._view.layout.setTranscriptWorking(false);
    this._view.layout.setPanelVisible(true);
    this._updateControls();
    const interaction = this._createVoiceInteraction(pointerId);
    this._pendingVoiceInteraction = interaction;
    this._recordVoiceInteractionEvent(interaction, "pointer.down", { pointerId });
    // The high-priority voice surface already owns this InputManager pointer.
    // Suspend the lower world surface as well so a second pointer cannot start
    // navigation while the voice interaction is active.
    this._captureWorldInputForVoice();
    void this._startListeningAfterCleanup(pointerId).finally(() => {
      if (this._pressPointerId === pointerId && this._state.kind !== "voice") {
        this._pressPointerId = undefined;
        this._releaseWorldInputForVoice();
      }
      if (this._pendingVoiceInteraction === interaction && this._state.kind !== "voice") {
        this._pendingVoiceInteraction = undefined;
      }
    });
  }

  handlePointerUp(pointerId: number): void {
    this._handlePointerRelease(pointerId, "pointer.up");
  }

  handlePointerEndDrag(pointerId: number): void {
    this._handlePointerRelease(pointerId, "pointer.end_drag");
  }

  handlePointerCancel(pointerId: number): void {
    if (this._pressPointerId !== pointerId) return;
    const traceTarget = this._resolveVoiceInteractionTrace();
    if (traceTarget) {
      this._recordVoiceInteractionEvent(traceTarget.interaction, "pointer.cancel", { pointerId }, traceTarget.attempt);
    }
    this._interruptVoiceInteraction("pointer.cancel", pointerId);
  }

  private _handlePointerRelease(pointerId: number, type: "pointer.up" | "pointer.end_drag"): void {
    const traceTarget = this._resolveVoiceInteractionTrace();
    if (traceTarget)
      this._recordVoiceInteractionEvent(traceTarget.interaction, type, { pointerId }, traceTarget.attempt);
    if (this._pressPointerId !== pointerId) return;
    this._pressPointerId = undefined;
    void this.stopListening();
  }

  private async _waitForAsrTailWindow(attempt: VoiceAttempt): Promise<void> {
    const releasedAtMilliseconds = attempt.releasedAtMilliseconds ?? performance.now();
    attempt.tailWindowStartedAtMilliseconds = performance.now();
    this._updateAsrTrace(attempt);

    while (this._isCurrentVoiceAttempt(attempt)) {
      const deadline = resolveSeedWorldAsrTailDeadlineMilliseconds(
        attempt.tailTuning,
        releasedAtMilliseconds,
        attempt.lastTranscriptAtMilliseconds
      );
      const remainingMilliseconds = deadline - performance.now();
      if (remainingMilliseconds <= 0) break;
      await waitForMilliseconds(remainingMilliseconds);
    }

    attempt.tailWindowEndedAtMilliseconds = performance.now();
    this._updateAsrTrace(attempt);
  }

  private async _finishRecognition(attempt: VoiceAttempt): Promise<void> {
    await this._waitForAsrTailWindow(attempt);
    if (!this._isCurrentVoiceAttempt(attempt)) return;
    attempt.stopRequestedAtMilliseconds = performance.now();
    attempt.textAtStop = attempt.transcript;
    this._updateAsrTrace(attempt);
    const outcome = await attempt.session.stop();
    this._applyAsrOutcome(attempt, outcome);
    if (!this._isCurrentVoiceAttempt(attempt)) return;
    if (outcome.status === "failed") {
      this._completeAsrFailure(attempt, outcome.error);
      return;
    }
    if (outcome.status === "aborted") {
      this._showFeedback("invalid-speech", "未识别到文字");
      this._recordAsrRejection(attempt, "未识别到文字");
      return;
    }
    const task = outcome.text.trim();
    if (!task) {
      this._showFeedback("invalid-speech", "未识别到文字");
      this._recordAsrRejection(attempt, "未识别到文字");
      return;
    }
    attempt.traceRecorded = true;
    const asrTrace = createAsrTrace(attempt, this._asrClient.getDiagnostics());
    this._updateAsrTrace(attempt, asrTrace.diagnostics);
    if (this._tracedVoiceAttempt === attempt) this._tracedVoiceAttempt = undefined;
    await this.submit(task, "voice", "next-step", asrTrace, attempt.traceInteractionId);
  }

  private _createVoiceAttempt(session: AsrSession, interaction: VoiceInteractionTrace): VoiceAttempt {
    return {
      session,
      interaction,
      startedAt: interaction.startedAt,
      startedAtMilliseconds: interaction.startedAtMilliseconds,
      tailTuning: this._getAsrTailTuning(),
      transcripts: [],
      released: false,
      transcript: "",
      traceRecorded: false
    };
  }

  private _handleAsrText(attempt: VoiceAttempt, payload: AsrTextPayload): void {
    if (!this._isCurrentVoiceAttempt(attempt)) return;
    const receivedAtMilliseconds = performance.now();
    attempt.transcript = payload.text.trim();
    attempt.lastTranscriptAtMilliseconds = receivedAtMilliseconds;
    attempt.lastTranscriptIsFinal = payload.isFinal;
    const previousTranscript = attempt.transcripts.at(-1);
    if (
      attempt.transcript &&
      (previousTranscript?.text !== attempt.transcript ||
        previousTranscript?.seq !== payload.seq ||
        previousTranscript?.isFinal !== payload.isFinal)
    ) {
      attempt.transcripts.push({
        elapsedMilliseconds: receivedAtMilliseconds - attempt.startedAtMilliseconds,
        text: attempt.transcript,
        seq: payload.seq,
        isFinal: payload.isFinal,
        phase:
          attempt.stopRequestedAtMilliseconds !== undefined
            ? "after-stop"
            : attempt.releasedAtMilliseconds !== undefined
              ? "after-release-before-stop"
              : "before-release"
      });
      if (attempt.transcripts.length > 32) attempt.transcripts.shift();
    }
    this._updateAsrTrace(attempt);
    if (this._state.kind === "voice" && (this._state.phase === "listening" || this._state.phase === "recognizing")) {
      const fallback = "我在听";
      this._setTranscript(attempt.transcript || fallback, attempt.transcript ? "content" : "system");
    }
  }

  private _applyAsrOutcome(attempt: VoiceAttempt, outcome: AsrSessionOutcome): void {
    attempt.endedAtMilliseconds ??= performance.now();
    attempt.endReason = outcome.reason;
    attempt.sessionId = outcome.sessionId;
    attempt.transcript = outcome.text.trim();
    attempt.error = outcome.status === "failed" ? outcome.error : undefined;
    this._updateAsrTrace(attempt);
  }

  private _completeAsrFailure(attempt: VoiceAttempt, error: AsrError): void {
    if (!this._isCurrentVoiceAttempt(attempt)) return;
    this._recordVoiceInteractionEvent(attempt.interaction, "asr.failed", {}, attempt);
    if (error.error !== "no-speech" && error.error !== "aborted") this._debugController.enable();
    const category: FeedbackCategory =
      error.error === "no-speech" ? "invalid-speech" : error.error === "unsupported" ? "asr-unavailable" : "asr-error";
    this._showFeedback(category, getAsrDisplayMessage(error));
    this._recordAsrRejection(attempt, error);
  }

  private _rejectSpeechAttempt(attempt: VoiceAttempt, message: "说话时间太短" | "未识别到文字"): void {
    if (!this._isCurrentVoiceAttempt(attempt)) return;
    attempt.transcript = "";
    this._showFeedback("invalid-speech", message);
    this._recordVoiceInteractionEvent(attempt.interaction, "asr.abort_requested", {}, attempt);
    const cleanup = this._abortVoiceAttempt(attempt, () => this._recordAsrRejection(attempt, message));
    this._trackAsrCleanup(cleanup);
  }

  private async _startListeningAfterCleanup(pointerId: number): Promise<void> {
    await this._waitForAsrCleanup();
    if (this._destroyed || this._pressPointerId !== pointerId) {
      if (this._pendingVoiceInteraction?.pointerId === pointerId) this._pendingVoiceInteraction = undefined;
      return;
    }
    await this.startListening();
  }

  private async _waitForAsrCleanup(): Promise<void> {
    while (this._asrCleanupPromise) await this._asrCleanupPromise;
  }

  private _abortAndTrackAsrCleanup(attempt: VoiceAttempt): void {
    this._recordVoiceInteractionEvent(attempt.interaction, "asr.abort_requested", {}, attempt);
    const cleanup = this._abortVoiceAttempt(attempt, () => this._finishCancelledAsrTrace(attempt));
    this._trackAsrCleanup(cleanup);
  }

  private async _abortVoiceAttempt(attempt: VoiceAttempt, finishTrace: () => void): Promise<void> {
    const outcome = await attempt.session.abort();
    this._applyAsrOutcome(attempt, outcome);
    if (outcome.status !== "failed") await attempt.session.released;
    if (outcome.status === "failed") {
      this._recordVoiceInteractionEvent(attempt.interaction, "asr.cleanup_failed", {}, attempt);
    }
    finishTrace();
    if (outcome.status === "failed" && !this._destroyed) {
      this._debugController.enable();
      this._showFeedback("asr-error", "麦克风清理失败，请刷新页面后重试。");
    }
  }

  private _trackAsrCleanup(cleanup: Promise<void>): void {
    const previousCleanup = this._asrCleanupPromise;
    const combinedCleanup = previousCleanup ? Promise.all([previousCleanup, cleanup]).then(() => undefined) : cleanup;
    const trackedCleanup = combinedCleanup.finally(() => {
      if (this._asrCleanupPromise === trackedCleanup) this._asrCleanupPromise = undefined;
    });
    this._asrCleanupPromise = trackedCleanup;
  }

  private _cancelListening(): void {
    this._interruptVoiceInteraction("controller.cancel");
  }

  private _handlePageLifecycleEvent(type: string, interrupt: boolean): void {
    const traceTarget = this._resolveVoiceInteractionTrace();
    if (!traceTarget) return;
    this._recordVoiceInteractionEvent(traceTarget.interaction, type, {}, traceTarget.attempt);
    if (!interrupt) return;
    if (
      this._pressPointerId === undefined &&
      this._state.kind !== "voice" &&
      this._pendingVoiceInteraction !== traceTarget.interaction
    ) {
      return;
    }
    this._interruptVoiceInteraction(type);
  }

  private _interruptVoiceInteraction(reason: string, expectedPointerId?: number): void {
    if (expectedPointerId !== undefined && this._pressPointerId !== expectedPointerId) return;
    const traceTarget = this._resolveVoiceInteractionTrace();
    if (traceTarget) {
      traceTarget.interaction.interrupted = true;
      traceTarget.interaction.interruptionReason = reason;
      this._recordVoiceInteractionEvent(traceTarget.interaction, "interaction.interrupted", {}, traceTarget.attempt);
    }
    const state = this._state;
    this._pendingVoiceInteraction = undefined;
    if (state.kind === "voice") {
      this._transition({ kind: "idle" });
      this._abortAndTrackAsrCleanup(state.attempt);
    } else {
      this._pressPointerId = undefined;
      this._releaseWorldInputForVoice();
    }
  }

  private _createVoiceInteraction(pointerId?: number): VoiceInteractionTrace {
    return {
      startedAt: new Date().toISOString(),
      startedAtMilliseconds: performance.now(),
      pointerId,
      events: [],
      interrupted: false
    };
  }

  private _resolveVoiceInteractionTrace(): { interaction: VoiceInteractionTrace; attempt?: VoiceAttempt } | undefined {
    if (this._state.kind === "voice") {
      return { interaction: this._state.attempt.interaction, attempt: this._state.attempt };
    }
    if (this._pendingVoiceInteraction) return { interaction: this._pendingVoiceInteraction };
    const tracedAttempt = this._tracedVoiceAttempt;
    if (tracedAttempt && !tracedAttempt.traceRecorded) {
      return { interaction: tracedAttempt.interaction, attempt: tracedAttempt };
    }
    return undefined;
  }

  private _recordVoiceInteractionEvent(
    interaction: VoiceInteractionTrace,
    type: string,
    details: Partial<Pick<VoiceInteractionTraceEvent, "pointerId" | "fromState" | "toState">> = {},
    attempt?: VoiceAttempt
  ): void {
    interaction.events.push({
      elapsedMilliseconds: Math.max(0, performance.now() - interaction.startedAtMilliseconds),
      type,
      controllerState: describeAssistantState(this._state),
      activePointerId: this._pressPointerId,
      visibilityState: document.visibilityState,
      ...details
    });
    if (interaction.events.length > MAX_ASR_INTERACTION_TRACE_EVENTS) interaction.events.shift();
    if (attempt) this._updateAsrTrace(attempt);
  }

  private _isCurrentVoiceAttempt(attempt: VoiceAttempt): boolean {
    return !this._destroyed && this._state.kind === "voice" && this._state.attempt === attempt;
  }

  private _captureWorldInputForVoice(): void {
    if (this._voiceOwnsWorldInput) return;
    this._voiceOwnsWorldInput = true;
    this._options.setWorldInputEnabled(false);
  }

  private _releaseWorldInputForVoice(): void {
    if (!this._voiceOwnsWorldInput) return;
    this._voiceOwnsWorldInput = false;
    if (!this._taskOwnsWorldInput && !this._transcriptOwnsWorldInput) this._options.setWorldInputEnabled(true);
  }

  private _recordAsrRejection(attempt: VoiceAttempt, error: unknown): void {
    if (attempt.traceRecorded) return;
    attempt.traceRecorded = true;
    const asr = createAsrTrace(attempt, this._asrClient.getDiagnostics());
    const updated = this._traceStore.updateActive(attempt.traceInteractionId, {
      input: attempt.transcript,
      asr
    });
    if (updated) {
      this._traceStore.finish(attempt.traceInteractionId, "asr-rejected", { error });
    } else {
      this._traceStore.recordAsrRejection({ text: attempt.transcript, asr, error });
    }
    if (this._tracedVoiceAttempt === attempt) this._tracedVoiceAttempt = undefined;
  }

  private _updateAsrTrace(attempt: VoiceAttempt, diagnostics = this._asrClient.getDiagnostics()): void {
    if (attempt.traceRecorded) return;
    this._traceStore.updateActive(attempt.traceInteractionId, {
      input: attempt.transcript,
      asr: createAsrTrace(attempt, diagnostics)
    });
  }

  private _finishCancelledAsrTrace(attempt: VoiceAttempt): void {
    if (attempt.traceRecorded) return;
    attempt.traceRecorded = true;
    const reason = attempt.interaction.interruptionReason ?? "controller.cancel";
    const error = new Error(`ASR interaction cancelled before Agent execution: ${reason}`);
    this._traceStore.updateActive(attempt.traceInteractionId, {
      input: attempt.transcript,
      asr: createAsrTrace(attempt, this._asrClient.getDiagnostics())
    });
    if (!this._traceStore.finish(attempt.traceInteractionId, "cancelled", { error })) {
      this._traceStore.recordAsrOutcome({ text: attempt.transcript,
        asr: createAsrTrace(attempt, this._asrClient.getDiagnostics()), error }, "cancelled");
    }
    if (this._tracedVoiceAttempt === attempt) this._tracedVoiceAttempt = undefined;
  }

  private _isVoiceInteractionBusy(): boolean {
    return this._state.kind === "voice";
  }

  private _isInteractionBusy(): boolean {
    return this._state.kind === "voice" || this.session.running;
  }

  private _transition(state: AssistantState): void {
    if (state.kind === "idle" && this._agentPresentation && !this._destroyed) state = this._agentPresentation;
    const previousState = this._state;
    if (state.kind === "voice") { this._view.controlButton.cancelGesture(); this._view.layout.cancelReading(); }
    this._state = state;
    const traceAttempt =
      state.kind === "voice" ? state.attempt : previousState.kind === "voice" ? previousState.attempt : undefined;
    if (traceAttempt) {
      this._recordVoiceInteractionEvent(
        traceAttempt.interaction,
        "controller.transition",
        {
          fromState: describeAssistantState(previousState),
          toState: describeAssistantState(state)
        },
        traceAttempt
      );
    }
    if (previousState.kind === "voice" && state.kind !== "voice") {
      if (this._pressPointerId !== undefined) {
        const pointerId = this._pressPointerId;
        this._recordVoiceInteractionEvent(
          previousState.attempt.interaction,
          "pointer.cleared_on_voice_exit",
          { pointerId },
          previousState.attempt
        );
        this._pressPointerId = undefined;
      }
      this._releaseWorldInputForVoice();
    }
    if (state.kind !== "idle") this._view.layout.setPresentation(
      state.kind === "agent" ? "progress" : state.kind === "feedback" && (state.category === "task-result" || state.category === "task-error") ? "result" : "voice"
    );
    const listening = state.kind === "voice" && state.phase === "listening";
    const working = state.kind === "agent" || (state.kind === "voice" && state.phase !== "listening");
    this._view.orbMaterial.shaderData.setFloat("material_Listening", listening ? 1 : 0);
    this._view.layout.setTranscriptWorking(working);
    // Keep the current transcript while fading out. Replacing it with hidden-state
    // copy before opacity reaches zero causes that copy to flash for one frame.
    if (state.kind !== "idle") {
      const presentation = getAssistantStatePresentation(state);
      this._setTranscript(presentation.text, presentation.tone);
    }
    const fadeOutSeconds =
      state.kind === "idle" && previousState.kind === "feedback"
        ? getFeedbackDismissPolicy(previousState.category).fadeOutSeconds
        : undefined;
    this._view.layout.setPanelVisible(state.kind !== "idle" && (!this._turnHidden || state.kind === "voice"), fadeOutSeconds);
    this._syncTaskFeedbackDismiss();
    this._updateControls();
    this._screenshotLayout?.();
  }

  private _setTranscript(text: string, tone: VoiceHudTextTone = "system"): void {
    this._view.layout.setTranscript(stripSeedWorldChatDisplayEmoji(text));
    this._view.layout.setTranscriptColor(tone === "content" ? CONTENT_TEXT_COLOR : SYSTEM_TEXT_COLOR);
  }

  private _showFeedback(category: FeedbackCategory, message: string, tone: VoiceHudTextTone = "system"): void {
    this._releaseWorldInputForVoice();
    this._transition({ kind: "feedback", category, message, tone });
    if (category !== "task-result" && category !== "task-error") {
      this._schedulePanelDismiss(getFeedbackDismissPolicy(category).visibleMilliseconds);
    }
  }

  private _canDismissTaskFeedback(): boolean {
    const state = this._state;
    return !this._destroyed && this.root.isActive && !this._turnHidden
      && state.kind === "feedback" && (state.category === "task-result" || state.category === "task-error")
      && !this.session.running && !this.session.canContinue && !this._view.layout.hovered
      && this._pressPointerId === undefined && !this._transcriptOwnsWorldInput && !this._taskOwnsWorldInput;
  }

  private _syncTaskFeedbackDismiss(): void {
    if (!this._canDismissTaskFeedback()) {
      this._clearResultTimer();
    } else if (this._resultTimer === undefined && this._state.kind === "feedback") {
      this._schedulePanelDismiss(getFeedbackDismissPolicy(this._state.category).visibleMilliseconds);
    }
  }

  private _schedulePanelDismiss(delayMilliseconds: number): void {
    this._clearResultTimer();
    this._resultTimer = window.setTimeout(() => {
      this._resultTimer = undefined;
      if (!this._destroyed && this._state.kind === "feedback") {
        if (this._state.category === "task-result" || this._state.category === "task-error") {
          if (!this._canDismissTaskFeedback()) return;
          if (this._view.layout.expanded) {
            this._view.layout.setExpanded(false);
            return;
          }
        }
        if (!this.session.running && !this.session.canContinue) this._dismissedPresentationId = this.session.snapshot.current?.id;
        this._transition({ kind: "idle" });
      }
    }, delayMilliseconds);
  }

  private _clearResultTimer(): void {
    if (this._resultTimer === undefined) return;
    window.clearTimeout(this._resultTimer);
    this._resultTimer = undefined;
  }
}

function resolveTaskErrorMessage(value: unknown): string {
  const failure = getAgentTaskFailure(value);
  if (failure) return failure.message;
  return value instanceof AsapRateLimitError
    ? value.message
    : "任务执行失败，请重试。";
}

function createAsrTrace(attempt: VoiceAttempt, diagnostics?: AgentTraceAsr["diagnostics"]): AgentTraceAsr {
  const {
    listeningStartedAtMilliseconds,
    releasedAtMilliseconds,
    tailWindowStartedAtMilliseconds,
    tailWindowEndedAtMilliseconds,
    stopRequestedAtMilliseconds,
    endedAtMilliseconds
  } = attempt;
  const elapsedFromStart = (timestamp: number | undefined): number | undefined =>
    timestamp === undefined ? undefined : Math.max(0, timestamp - attempt.startedAtMilliseconds);
  return {
    startedAt: attempt.startedAt,
    tailTuning: attempt.tailTuning,
    startDurationMilliseconds:
      listeningStartedAtMilliseconds === undefined
        ? undefined
        : listeningStartedAtMilliseconds - attempt.startedAtMilliseconds,
    listeningDurationMilliseconds:
      listeningStartedAtMilliseconds === undefined || releasedAtMilliseconds === undefined
        ? undefined
        : Math.max(0, releasedAtMilliseconds - listeningStartedAtMilliseconds),
    finalizationDurationMilliseconds:
      releasedAtMilliseconds === undefined || endedAtMilliseconds === undefined
        ? undefined
        : Math.max(0, endedAtMilliseconds - releasedAtMilliseconds),
    pointerReleasedAtElapsedMilliseconds: elapsedFromStart(releasedAtMilliseconds),
    stopRequestedAtElapsedMilliseconds: elapsedFromStart(stopRequestedAtMilliseconds),
    endedAtElapsedMilliseconds: elapsedFromStart(endedAtMilliseconds),
    tailWindowDurationMilliseconds:
      tailWindowStartedAtMilliseconds === undefined || tailWindowEndedAtMilliseconds === undefined
        ? undefined
        : Math.max(0, tailWindowEndedAtMilliseconds - tailWindowStartedAtMilliseconds),
    releaseToStopDurationMilliseconds:
      releasedAtMilliseconds === undefined || stopRequestedAtMilliseconds === undefined
        ? undefined
        : Math.max(0, stopRequestedAtMilliseconds - releasedAtMilliseconds),
    stopToEndDurationMilliseconds:
      stopRequestedAtMilliseconds === undefined || endedAtMilliseconds === undefined
        ? undefined
        : Math.max(0, endedAtMilliseconds - stopRequestedAtMilliseconds),
    textAtPointerRelease: attempt.textAtRelease,
    textAtStopRequest: attempt.textAtStop,
    postReleaseTranscriptCount: attempt.transcripts.filter((entry) => entry.phase !== "before-release").length,
    postStopTranscriptCount: attempt.transcripts.filter((entry) => entry.phase === "after-stop").length,
    finalTextWasFinal: attempt.lastTranscriptIsFinal,
    endReason: attempt.endReason,
    sessionId: attempt.sessionId ?? attempt.error?.sessionId,
    interactionEvents: structuredClone(attempt.interaction.events),
    transcripts: structuredClone(attempt.transcripts),
    finalText: attempt.transcript,
    diagnostics: selectAsrSessionDiagnostics(diagnostics, attempt.session.id),
    error: attempt.error
      ? {
          code: attempt.error.code ?? attempt.error.error,
          message: attempt.error.message ?? getAsrDisplayMessage(attempt.error),
          fatal: Boolean(attempt.error.fatal)
        }
      : undefined
  };
}

function waitForMilliseconds(durationMilliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMilliseconds));
}

function createFailedAsrTrace(
  error: unknown,
  diagnostics?: AgentTraceAsr["diagnostics"],
  interaction?: VoiceInteractionTrace
): AgentTraceAsr {
  const normalized = isRecordValue(error) ? error : undefined;
  return {
    startedAt: interaction?.startedAt ?? new Date().toISOString(),
    interactionEvents: interaction ? structuredClone(interaction.events) : undefined,
    transcripts: [],
    finalText: "",
    diagnostics,
    error: {
      code: typeof normalized?.code === "string" ? normalized.code : "ASR_START_FAILED",
      message: error instanceof Error ? error.message : String(error),
      fatal: true
    }
  };
}

function selectAsrSessionDiagnostics(
  diagnostics: AgentTraceAsr["diagnostics"] | undefined,
  sessionId: string
): AgentTraceAsr["diagnostics"] | undefined {
  if (!diagnostics) return undefined;
  return {
    ...diagnostics,
    events: diagnostics.events.filter((event) => {
      const eventSessionId = event.detail?.sessionId;
      return eventSessionId === undefined || eventSessionId === sessionId;
    })
  };
}

function getAssistantStatePresentation(state: Exclude<AssistantState, { kind: "idle" }>): {
  text: string;
  tone: VoiceHudTextTone;
} {
  if (state.kind === "agent") return { text: state.task, tone: "content" };
  if (state.kind === "feedback") return { text: state.message, tone: state.tone };
  if (state.phase === "starting") return { text: "我在听", tone: "system" };
  if (state.phase === "recognizing") {
    return {
      text: state.attempt.transcript || "我在听",
      tone: state.attempt.transcript ? "content" : "system"
    };
  }
  return {
    text: state.attempt.transcript || "我在听",
    tone: state.attempt.transcript ? "content" : "system"
  };
}

function describeAssistantState(state: AssistantState): string {
  return state.kind === "voice" ? `voice:${state.phase}` : state.kind;
}

/** Native Button with click admission delayed until the entire pointer gesture settles. */
class VoiceTaskButton extends Button {
  begin?: () => { click(): void; dismiss(): void } | undefined;
  release?: () => void;
  layout?: VoiceHudLayout;
  private readonly _gesture = new SeedWorldTurnGesture();
  private _actions?: { click(): void; dismiss(): void };
  private _clickInside = false;
  private _scale = 1;

  override onPointerDown(event: PointerEventData): void {
    if (!this.interactive || this._actions) return;
    const actions = this.begin?.();
    if (!actions) return;
    this._scale = resolveSeedWorldHudScale(this.engine.canvas.width, this.engine.canvas.height);
    const { id, position } = event.pointer;
    this._gesture.begin(id, position.x / this._scale, -position.y / this._scale);
    this._actions = actions;
    this._clickInside = false;
    this.layout?.resetPanelPosition();
    this.layout?.holdPanel(position.x / this._scale, -position.y / this._scale);
  }

  override onPointerDrag(event: PointerEventData): void {
    if (!this._actions) return;
    const { id, position } = event.pointer;
    if (this._gesture.move(id, position.x / this._scale, -position.y / this._scale))
      this.layout?.movePanel(this._gesture.x, this._gesture.y);
  }

  override onPointerClick(event: PointerEventData): void {
    if (this._gesture.owns(event.pointer.id)) this._clickInside = true;
  }

  override onPointerEndDrag(event?: PointerEventData): void {
    super.onPointerEndDrag();
    if (!event) return;
    this.onPointerDrag(event);
    const outcome = this._gesture.finish(event.pointer.id, event.pointer.phase === PointerPhase.Leave);
    if (!outcome) return;
    const actions = this._actions;
    this._actions = undefined;
    this.release?.();
    if (outcome === "dismiss") {
      this.layout?.releasePanel(true, this._gesture.velocity());
      actions?.dismiss();
    } else {
      this.layout?.releasePanel(false);
      if (outcome === "click" && this._clickInside && this.interactive) {
        super.onPointerClick(event);
        actions?.click();
      }
    }
    this._clickInside = false;
  }

  cancelGesture(): void {
    if (!this._actions) return;
    this._gesture.cancel();
    this._actions = undefined;
    this._clickInside = false;
    this.layout?.releasePanel(false);
    this.release?.();
  }
}

/** The whole glass is a touch surface. Only overflowing body text reserves vertical drags for reading. */
class VoiceTranscriptPointer extends Script {
  layout?: VoiceHudLayout;
  scrollable = true;
  tracksHover = false;
  private _pointer?: { id: number; x: number; y: number; lastY: number; scrollableBody: boolean };
  private readonly _gesture = new SeedWorldTurnGesture();
  private _intent?: "scroll" | "throw";
  private _dismiss?: () => void;
  private _scale = 1;
  private _inside = false;
  private _clicked = false;
  private _stoppedScroll = false;

  get draggingPanel(): boolean { return this._intent === "throw"; }

  override onPointerEnter(): void {
    this._inside = true;
    if (this.tracksHover) this.layout?.setPointerOverPanel(true);
  }
  override onPointerExit(): void {
    this._inside = false;
    if (this.tracksHover) this.layout?.setPointerOverPanel(false);
  }
  override onPointerDown(event: PointerEventData): void {
    if (this._pointer || !this.layout?.beginReading(this)) return;
    const { id, position } = event.pointer;
    this._scale = resolveSeedWorldHudScale(this.engine.canvas.width, this.engine.canvas.height);
    this._pointer = { id, x: position.x, y: position.y, lastY: position.y,
      scrollableBody: this.scrollable && this.layout.canScroll };
    this._stoppedScroll = this.layout.beginTranscriptScroll();
    this._dismiss = this.layout.controller?.beginTurnDismissGesture();
    this._gesture.begin(id, position.x / this._scale, -position.y / this._scale);
    this._clicked = false;
  }
  override onPointerDrag(event: PointerEventData): void {
    const press = this._pointer;
    if (!press || press.id !== event.pointer.id) return;
    const { position } = event.pointer;
    if (!this._intent) {
      this._intent = turnDragIntent(press.scrollableBody, (position.x - press.x) / this._scale, (position.y - press.y) / this._scale);
      if (this._intent === "throw" && this._dismiss) {
        this.layout?.resetPanelPosition();
        this.layout?.holdPanel(press.x / this._scale, -press.y / this._scale);
      }
    }
    if (this._intent === "throw" && this._dismiss) {
      if (this._gesture.move(press.id, position.x / this._scale, -position.y / this._scale))
        this.layout?.movePanel(this._gesture.x, this._gesture.y);
    } else if (this._intent === "scroll") {
      this.layout?.scrollTranscript((press.lastY - position.y) / this._scale);
    }
    // Keep all pre-threshold motion so a slow drag does not lose its first scroll increment.
    if (this._intent) press.lastY = position.y;
  }
  override onPointerClick(event: PointerEventData): void {
    if (this._pointer?.id === event.pointer.id) this._clicked = true;
  }
  override onPointerEndDrag(event: PointerEventData): void {
    this.onPointerDrag(event);
    const press = this._pointer;
    if (!press || press.id !== event.pointer.id) return;
    const cancelled = event.pointer.phase === PointerPhase.Leave;
    const click = this._clicked && !this._intent && !cancelled && !this._stoppedScroll;
    const throwing = this._intent === "throw" && !!this._dismiss;
    const outcome = this._gesture.finish(press.id, cancelled);
    const dismiss = this._dismiss;
    const velocity = this._gesture.velocity();
    this.layout?.endTranscriptScroll(cancelled || this._intent !== "scroll");
    this._clear();
    if (throwing) {
      this.layout?.releasePanel(outcome === "dismiss", velocity);
      if (outcome === "dismiss") dismiss?.();
    } else if (click) this.layout?.toggleTranscript();
  }
  override onUpdate(): void {
    const wheel = this.engine.inputManager.wheelDelta?.y;
    if (this.scrollable && this._inside && !this._pointer && wheel) this.layout?.wheelTranscript(wheel);
  }
  cancel(): void {
    if (!this._pointer) return;
    if (this._intent === "throw" && this._dismiss) this.layout?.releasePanel(false);
    this._gesture.cancel();
    this.layout?.endTranscriptScroll(true);
    this._clear();
  }
  private _clear(): void {
    this._pointer = undefined;
    this._intent = undefined;
    this._dismiss = undefined;
    this._clicked = false;
    this.layout?.endReading(this);
  }
}

class VoiceOrbPointer extends Script {
  controller: SeedWorldVoiceHudController | undefined;

  override onPointerDown(eventData: PointerEventData): void {
    this.controller?.handlePointerDown(eventData.pointer.id);
  }

  override onPointerUp(eventData: PointerEventData): void {
    this.controller?.handlePointerUp(eventData.pointer.id);
  }

  override onPointerEndDrag(eventData: PointerEventData): void {
    const pointer = eventData.pointer;
    if (pointer.phase === PointerPhase.Leave) this.controller?.handlePointerCancel(pointer.id);
    else this.controller?.handlePointerEndDrag(pointer.id);
  }
}

class VoiceHudLayout extends Script {
  controller: SeedWorldVoiceHudController | undefined;
  controlButton: VoiceTaskButton | undefined;
  controlGlass: SeedWorldLiquidGlassUiMaterial | undefined;
  controlIcon: Image | undefined;
  panelImage: Image | undefined;
  panelGlass: SeedWorldLiquidGlassUiMaterial | undefined;
  panelTransform: UITransform | undefined;
  orbGlass: SeedWorldLiquidGlassUiMaterial | undefined;
  orbMaterial: Material | undefined;
  orbTransform: UITransform | undefined;
  transcriptViewport: Image | undefined;
  transcript: Text | undefined;
  transcriptFooter: Text | undefined;
  readingPointers: VoiceTranscriptPointer[] = [];
  onPhotoDockLayout?: () => void;
  private _publishedPhotoDockBottom = NaN;

  /** Current animated upper edge in HUD units, measured from the viewport bottom. */
  get photoDockBottom(): number {
    const orbTop = ORB_BOTTOM + ORB_SIZE;
    if (!this.panelImage?.enabled || this._panelOpacity <= 0) return orbTop;
    const scale = 1 + this._lift * 0.02;
    const radians = this._angle * Math.PI / 180;
    const halfHeight = (Math.abs(Math.cos(radians)) * this._panelHeight
      + Math.abs(Math.sin(radians)) * this._panelWidth) * scale / 2;
    const top = (this.panelTransform?.alignBottom ?? PANEL_BOTTOM) + this._panelHeight / 2 + halfHeight;
    // Fade-in/out and height changes use the glass's own progress, with no second tween.
    return orbTop + Math.max(0, top - orbTop) * this._panelOpacity;
  }

  onReadInteraction?: (active: boolean) => void;
  onExpandedChange?: () => void;
  onReadActivity?: () => void;
  onHoverChange?: () => void;
  private _mouseInput = false;
  private _pointerOverPanel = false;
  private _hovered = false;
  get hovered(): boolean { return this._hovered; }
  private readonly _onPointerInput = (event: PointerEvent) => {
    this._mouseInput = event.pointerType === "mouse";
    this._syncHover();
  };
  private readonly _onPointerBlur = () => this.setPointerOverPanel(false);
  override onAwake(): void {
    window.addEventListener("pointermove", this._onPointerInput, true);
    window.addEventListener("pointerdown", this._onPointerInput, true);
    window.addEventListener("blur", this._onPointerBlur);
  }
  override onDestroy(): void {
    window.removeEventListener("pointermove", this._onPointerInput, true);
    window.removeEventListener("pointerdown", this._onPointerInput, true);
    window.removeEventListener("blur", this._onPointerBlur);
  }
  setPointerOverPanel(inside: boolean): void {
    this._pointerOverPanel = inside;
    this._syncHover();
  }
  private _syncHover(): void {
    const hovered = this._mouseInput && this._pointerOverPanel && this._panelTargetOpacity > 0;
    if (hovered === this._hovered) return;
    this._hovered = hovered;
    this.onHoverChange?.();
  }
  private _reader?: VoiceTranscriptPointer;

  beginReading(pointer: VoiceTranscriptPointer): boolean {
    if (this._reader || !this.readable) return false;
    this._reader = pointer;
    this.onReadInteraction?.(true);
    return true;
  }

  endReading(pointer: VoiceTranscriptPointer): void {
    if (this._reader !== pointer) return;
    this._reader = undefined;
    this.onReadInteraction?.(false);
  }
  transcriptMaterial: Material | undefined;
  private _presentation: "voice" | "progress" | "result" = "voice";
  private _expanded = false;
  private _hasDetails = false;
  private _details = "";
  private readonly _scroll = new SeedWorldTranscriptScroll();
  private readonly _clipMatrix = new Matrix();
  private readonly _clipBounds = new Vector4();
  private _lineCount = 1;
  private _visibleLines = 1;
  private _lineHeight = 28;


  get canScroll(): boolean { return this._expanded && this._scroll.maximum > 0; }
  get expanded(): boolean { return this._expanded; }
  get hasDetails(): boolean { return this._hasDetails; }
  get readable(): boolean { return this._presentation !== "voice" && this._panelTargetOpacity > 0 && !this._panelHeld && !this._motion; }

  resetTranscript(): void {
    this.cancelReading();
    this._expanded = false;
    this._hasDetails = false;
    this._scroll.reset();
    this._details = "";
    this._transcriptLayoutDirty = true;
  }

  setPresentation(mode: "voice" | "progress" | "result"): void {
    if (this._presentation === mode) return;
    this.cancelReading(mode !== "voice");
    this._presentation = mode;
    this._expanded = mode === "result";
    this._scroll.reset();
    this._transcriptLayoutDirty = true;
  }

  setTranscriptDetails(details: string): void {
    if (this._details === details) return;
    this._details = details;
    if (this._expanded && this._presentation === "progress") this._transcriptLayoutDirty = true;
  }

  toggleTranscript(): void {
    if (!this.readable) return;
    this.onReadActivity?.();
    this.setExpanded(!this._expanded);
  }

  setExpanded(expanded: boolean): void {
    const next = expanded && this._hasDetails;
    if (next === this._expanded) return;
    this._expanded = next;
    this._scroll.reset();
    this._transcriptLayoutDirty = true;
    this.onExpandedChange?.();
  }

  beginTranscriptScroll(): boolean { return this._scroll.begin(); }
  endTranscriptScroll(cancelled: boolean): void { this._scroll.release(cancelled); }
  scrollTranscript(delta: number): void {
    if (this.readable && this.canScroll) this._scroll.drag(delta);
  }
  wheelTranscript(delta: number): void {
    if (this.readable && this.canScroll) {
      this._scroll.wheel(delta);
      this.onReadActivity?.();
    }
  }

  cancelReading(preservePanelDrag = false): void {
    this._scroll.cancel();
    for (const pointer of this.readingPointers) {
      if (!preservePanelDrag || !pointer.draggingPanel) pointer.cancel();
    }
  }

  private _panelHeld = false;
  private _controlVisible = false;
  private _controlIconOpacity = 1;
  private _panelX = 0;
  private _panelY = 0;
  private _anchorX = 0;
  private _anchorY = 0;
  private _lift = 0;
  private _angle = 0;
  private _angleTarget = 0;
  private _gestureOpacity = 1;
  private _hintPulse = 0;
  private _discardReady = false;
  private _motion?: {
    x: number; y: number; angle: number; lift: number; opacity: number;
    targetX: number; targetY: number; elapsed: number; duration: number; dismiss: boolean
  };

  get dismissing(): boolean { return this._motion?.dismiss === true; }

  setControlVisible(visible: boolean): void {
    if (this._controlVisible === visible) return;
    this._controlVisible = visible;
    this._transcriptLayoutDirty = true;
  }

  setControlIconOpacity(value: number): void {
    this._controlIconOpacity = value;
    this._applyPanelOpacity();
  }

  movePanel(x: number, y: number): void {
    this._panelX = x;
    this._panelY = y;
    const distance = Math.hypot(x, y);
    this._angleTarget = Math.max(-6, Math.min(6, y * 0.035 - x * 0.012));
    this._gestureOpacity = 1 - Math.min(distance / (TURN_DISMISS_DISTANCE * 2), 1) * 0.28;
    if (!this._discardReady && distance >= TURN_DISMISS_DISTANCE) {
      this._discardReady = true;
      this._hintPulse = 1;
    } else if (distance < TURN_DISMISS_DISTANCE - 16) {
      this._discardReady = false;
    }
    this._applyPanelPose();
    this._applyPanelOpacity();
  }

  holdPanel(pointerX: number, pointerY: number): void {
    this._panelHeld = true;
    const scale = resolveSeedWorldHudScale(this._width, this._height);
    this._anchorX = pointerX - this._width / (2 * scale);
    this._anchorY = pointerY + this._height / scale - PANEL_BOTTOM - this._panelHeight / 2;
  }

  resetPanelPosition(): void {
    this._panelHeld = false;
    this._motion = undefined;
    this._panelX = this._panelY = this._anchorX = this._anchorY = 0;
    this._lift = this._angle = this._angleTarget = this._hintPulse = 0;
    this._gestureOpacity = 1;
    this._discardReady = false;
    this._applyPanelPose();
    this._applyPanelOpacity();
  }

  releasePanel(dismiss: boolean, velocity = { x: 0, y: 0 }): void {
    this._panelHeld = false;
    const target = turnThrow(this._panelX, this._panelY, velocity);
    this._motion = { x: this._panelX, y: this._panelY, angle: this._angle, lift: this._lift,
      opacity: this._gestureOpacity, targetX: dismiss ? target.x : 0, targetY: dismiss ? target.y : 0,
      elapsed: 0, duration: dismiss ? target.duration : 0.32, dismiss };
  }

  private _updatePanelMotion(delta: number): void {
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), 0.1) : 0;
    this._hintPulse = Math.max(0, this._hintPulse - dt / 0.2);
    const motion = this._motion;
    if (!motion && !this._panelHeld) return;
    if (motion) {
      motion.elapsed += dt;
      const t = Math.min(motion.elapsed / motion.duration, 1);
      // Flight keeps momentum; return uses a small, damped overshoot.
      const eased = motion.dismiss ? 1 - (1 - t) ** 2 : 1 - Math.exp(-8 * t) * Math.cos(10 * t);
      this._panelX = motion.x + (motion.targetX - motion.x) * eased;
      this._panelY = motion.y + (motion.targetY - motion.y) * eased;
      this._angle = motion.dismiss ? motion.angle * (1 + 0.25 * t) : motion.angle * (1 - eased);
      this._lift = motion.dismiss ? motion.lift * (1 - t) : motion.lift * (1 - eased);
      this._gestureOpacity = motion.dismiss ? motion.opacity : motion.opacity + (1 - motion.opacity) * eased;
      if (t >= 1) {
        if (motion.dismiss) {
          this.hidePanelImmediately();
          if (this.controlButton) this.controlButton.entity.isActive = false;
        }
        this.resetPanelPosition();
        return;
      }
    } else if (this._panelHeld) {
      const follow = 1 - Math.exp(-18 * dt);
      this._lift += (1 - this._lift) * follow;
      this._angle += (this._angleTarget - this._angle) * follow;
    }
    this._applyPanelPose();
    this._applyPanelOpacity();
  }

  private _applyPanelPose(): void {
    const scale = 1 + this._lift * 0.02;
    const offset = turnAnchorOffset(this._anchorX, this._anchorY, scale, this._angle);
    if (this.panelTransform) {
      this.panelTransform.setScale(scale, scale, 1);
      this.panelTransform.setRotation(0, 0, this._angle);
      this.panelTransform.alignCenter = this._panelX + offset.x;
      this.panelTransform.alignBottom = PANEL_BOTTOM + this._panelY + offset.y;
    }
    const buttonScale = 1 - Math.max(this._lift, 0) * 0.06;
    // Depress the icon, keeping the Button hit target stable for edge presses.
    this.controlIcon?.entity.transform.setScale(buttonScale, buttonScale, 1);
    this.panelGlass?.setRimHighlight(Math.max(this._lift, 0) * 0.18 + this._hintPulse * 0.3);
    this.controlGlass?.setRimHighlight(Math.max(this._lift, 0) * 0.12 + this._hintPulse * 0.2);
    this._updateTextShaderPosition();
  }

  private _updateTextShaderPosition(): void {
    if (!this._width) return;
    const scale = resolveSeedWorldHudScale(this._width, this._height);
    this.transcriptMaterial?.shaderData.setFloat("material_SeedWorldPanelLeftUv",
      (this._width * 0.5 + (this._panelX - this._panelWidth * 0.5) * scale) / this._width);
  }

  private _width = 0;
  private _height = 0;
  private _panelWidth = PANEL_MAX_WIDTH;
  private _panelHeight = 0;
  private _panelTargetHeight = 0;
  private _heightTransition?: { from: number; elapsed: number };
  private _contentOpacity = 1;
  private _singleLinePanelHeight = 0;
  private _transcriptLayoutDirty = true;
  private _sourceTranscript = "";
  private _panelOpacity = 0;
  private _panelFadeStartOpacity = 0;
  private _panelTargetOpacity = 0;
  private _panelFadeElapsed = 0;
  private _panelFadeDuration = PANEL_FADE_IN_SECONDS;
  private _transcriptRed = 1;
  private _transcriptGreen = 1;
  private _transcriptBlue = 1;
  private _transcriptWorking = false;
  private _transcriptWorkingStartedAt = 0;

  setPanelVisible(visible: boolean, fadeOutSeconds = PANEL_FADE_OUT_SECONDS): void {
    const targetOpacity = visible ? 1 : 0;
    if (targetOpacity === this._panelTargetOpacity) return;
    if (!visible) { this.cancelReading(); this.setPointerOverPanel(false); }
    if (visible) {
      if (this.panelImage) this.panelImage.enabled = true;
      if (this.transcriptViewport) this.transcriptViewport.entity.isActive = true;
      if (this.transcript) this.transcript.entity.isActive = true;
    }
    this._panelFadeStartOpacity = this._panelOpacity;
    this._panelTargetOpacity = targetOpacity;
    this._transcriptLayoutDirty = true;
    this._panelFadeElapsed = 0;
    this._panelFadeDuration = visible ? PANEL_FADE_IN_SECONDS : (this.dismissing ? this._motion!.duration : fadeOutSeconds);
  }

  hidePanelImmediately(): void {
    this.cancelReading();
    this.setPointerOverPanel(false);
    this._heightTransition = undefined;
    this._contentOpacity = 1;
    this._panelOpacity = 0;
    this._panelFadeStartOpacity = 0;
    this._panelTargetOpacity = 0;
    this._panelFadeElapsed = 0;
    this._applyPanelOpacity();
    if (this.panelImage) this.panelImage.enabled = false;
    if (this.transcriptViewport) this.transcriptViewport.entity.isActive = false;
    if (this.transcript) this.transcript.entity.isActive = false;
    if (this.transcriptFooter) this.transcriptFooter.entity.isActive = false;
  }

  setTranscriptColor(color: Color): void {
    this._transcriptRed = color.r;
    this._transcriptGreen = color.g;
    this._transcriptBlue = color.b;
    this._applyPanelOpacity();
  }

  setTranscript(text: string): void {
    if (!this.transcript || this._sourceTranscript === text) return;
    this._sourceTranscript = text;
    this._transcriptLayoutDirty = true;
  }

  setTranscriptWorking(working: boolean): void {
    if (working === this._transcriptWorking) return;
    this._transcriptWorking = working;
    if (working) this._transcriptWorkingStartedAt = this.engine.time.actualElapsedTime;
    const shaderData = this.transcriptMaterial?.shaderData;
    shaderData?.setFloat("material_SeedWorldWorking", working ? 1 : 0);
    if (!working) shaderData?.setFloat("material_SeedWorldWorkingTime", 0);
  }

  override onUpdate(deltaTime: number): void {
    const { width, height } = this.engine.canvas;
    const viewportChanged = width !== this._width || height !== this._height;
    if (viewportChanged) {
      this.controlButton?.cancelGesture();
      this.cancelReading();
      this._width = width;
      this._height = height;
      const uiToPixelScale = resolveSeedWorldHudScale(width, height);
      const controlSize = TASK_CONTROL_SIZE * uiToPixelScale;
      this.controlGlass?.setLayout(controlSize, controlSize, controlSize / 2);
      const orbPixelSize = ORB_SIZE * uiToPixelScale;
      this.orbGlass?.setLayout(orbPixelSize, orbPixelSize, orbPixelSize * 0.5);
      const referenceWidth = width / uiToPixelScale;
      this._panelWidth = Math.max(
        PANEL_MIN_WIDTH,
        Math.min(PANEL_MAX_WIDTH, referenceWidth - PANEL_HORIZONTAL_MARGIN * 2)
      );
      this._transcriptLayoutDirty = true;
    }
    if (this._transcriptLayoutDirty && !this._panelHeld && !this._motion) this._updateTranscriptLayout(viewportChanged);
    this._updatePanelHeight(deltaTime);
    this._scroll.update(deltaTime);
    const listening = this.controller?.listening === true;
    this.orbMaterial?.shaderData.setFloat("material_Time", this.engine.time.actualElapsedTime);
    if (this._transcriptWorking) {
      this.transcriptMaterial?.shaderData.setFloat(
        "material_SeedWorldWorkingTime",
        this.engine.time.actualElapsedTime - this._transcriptWorkingStartedAt
      );
    }
    const breath = 1 + Math.sin(this.engine.time.actualElapsedTime * 2.25) * (listening ? 0.018 : 0.045);
    const pressedScale = listening ? 1.08 : 1;
    this.orbTransform?.setScale(breath * pressedScale, breath * pressedScale, 1);
    this._updatePanelFade(deltaTime);
    this._updatePanelMotion(deltaTime);
  }

  override onLateUpdate(): void {
    const bottom = this.photoDockBottom;
    if (bottom !== this._publishedPhotoDockBottom) {
      this._publishedPhotoDockBottom = bottom;
      this.onPhotoDockLayout?.();
    }
    const viewport = this.transcriptViewport?.entity.transform as UITransform | undefined;
    const text = this.transcript?.entity.transform as UITransform | undefined;
    if (!viewport || !text || !this.transcriptMaterial) return;
    text.alignTop = -this._scroll.offset;
    // UI text vertices are world-space. Clip in the viewport's local space so
    // the mask follows the glass's translation, tilt and lift during a throw.
    Matrix.invert(viewport.worldMatrix, this._clipMatrix);
    this.transcriptMaterial.shaderData.setMatrix("material_SeedWorldTextClipMatrix", this._clipMatrix);
    this._clipBounds.set(-viewport.size.x / 2, -viewport.size.y / 2, viewport.size.x / 2, viewport.size.y / 2);
    this.transcriptMaterial.shaderData.setVector4("material_SeedWorldTextClipBounds", this._clipBounds);
    if (this.transcriptFooter && this.canScroll) {
      const first = Math.floor(Math.max(0, Math.min(this._scroll.maximum, this._scroll.offset)) / this._lineHeight);
      this.transcriptFooter.text = `${first + 1}–${Math.min(first + this._visibleLines, this._lineCount)} / ${this._lineCount} 行 · 上下滑动阅读 · 横向拖走`;
    }
  }

  private _updatePanelFade(deltaTime: number): void {
    if (this._panelOpacity === this._panelTargetOpacity) return;
    const frameTime = Number.isFinite(deltaTime) ? Math.min(Math.max(deltaTime, 0), 0.1) : 0;
    this._panelFadeElapsed += frameTime;
    const progress = Math.min(this._panelFadeElapsed / this._panelFadeDuration, 1);
    const easedProgress = progress * progress * (3 - 2 * progress);
    this._panelOpacity =
      this._panelFadeStartOpacity + (this._panelTargetOpacity - this._panelFadeStartOpacity) * easedProgress;
    if (progress >= 1) this._panelOpacity = this._panelTargetOpacity;
    this._applyPanelOpacity();
    if (this._panelOpacity === 0) {
      if (this.panelImage) this.panelImage.enabled = false;
      if (this.transcriptViewport) this.transcriptViewport.entity.isActive = false;
      if (this.transcript) this.transcript.entity.isActive = false;
      if (this.transcriptFooter) this.transcriptFooter.entity.isActive = false;
    }
  }

  private _applyPanelOpacity(): void {
    const opacity = Math.min(1, this._panelOpacity * this._gestureOpacity);
    this.panelGlass?.setOpacity(opacity);
    this.controlGlass?.setOpacity(opacity);
    if (this.controlIcon) this.controlIcon.color.a = opacity * this._controlIconOpacity;
    if (this.transcriptFooter) this.transcriptFooter.color.a = opacity * this._contentOpacity * 0.75;
    this.transcript?.color.set(this._transcriptRed, this._transcriptGreen, this._transcriptBlue, opacity * this._contentOpacity);
  }

  /** Bottom edge stays fixed; grabbing freezes the displayed size and its anchor. */
  private _updatePanelHeight(deltaTime: number): void {
    const transition = this._heightTransition;
    if (!transition || this._panelHeld || this._motion) return;
    const dt = Number.isFinite(deltaTime) ? Math.max(0, Math.min(deltaTime, 0.1)) : 0;
    transition.elapsed += dt;
    const t = Math.min(transition.elapsed / 0.36, 1);
    const eased = 1 - (1 - t) ** 3;
    this._panelHeight = transition.from + (this._panelTargetHeight - transition.from) * eased;
    // Give the glass room to open before revealing the new text. Text keeps its
    // natural glyph size and is clipped by its current layout, never stretched.
    const reveal = Math.max(0, (t - 0.2) / 0.8);
    this._contentOpacity = reveal * reveal * (3 - 2 * reveal);
    if (t === 1) {
      this._panelHeight = this._panelTargetHeight;
      this._heightTransition = undefined;
      this._contentOpacity = 1;
    }
    this._applyPanelSize();
    this._applyPanelOpacity();
  }

  private _applyPanelSize(): void {
    this.panelTransform?.size.set(this._panelWidth, this._panelHeight);
    const scale = resolveSeedWorldHudScale(this._width, this._height);
    this.panelGlass?.setLayout(this._panelWidth * scale, this._panelHeight * scale,
      this._singleLinePanelHeight * 0.5 * scale);
  }

  private _updateTranscriptLayout(immediate = false): void {
    const transcript = this.transcript;
    const panelTransform = this.panelTransform;
    if (!transcript || !panelTransform || this._height <= 0) return;

    const textTransform = transcript.entity.transform as UITransform;
    const viewport = this.transcriptViewport!.entity.transform as UITransform;
    viewport.alignRight = TRANSCRIPT_HORIZONTAL_PADDING + (this._controlVisible ? TASK_CONTROL_SPACE : 0);
    const contentWidth = Math.max(this._panelWidth - TRANSCRIPT_HORIZONTAL_PADDING * 2 - (this._controlVisible ? TASK_CONTROL_SPACE : 0), 1);
    const source = this._presentation === "progress" ? this._details || this._sourceTranscript : this._sourceTranscript;
    transcript.text = source;
    const metrics = this._measureTranscript(transcript, contentWidth);
    this._lineHeight = metrics.lineHeight;
    this._lineCount = Math.max(metrics.lines.length, 1);
    this._hasDetails = this._lineCount > 1 || source !== this._sourceTranscript;
    if (this._expanded && !this._hasDetails) this.setExpanded(false);
    const footerHeight = this._expanded ? TRANSCRIPT_FOOTER_HEIGHT : 0;
    this._visibleLines = this._expanded
      ? Math.max(1, Math.floor((PANEL_MAX_HEIGHT - TRANSCRIPT_VERTICAL_PADDING * 2 - footerHeight) / metrics.lineHeight))
      : 1;
    this._scroll.setMaximum(this._expanded ? Math.max(0, this._lineCount - this._visibleLines) * this._lineHeight : 0);
    if (this._expanded) {
      transcript.text = metrics.lines.join("\n");
    } else {
      transcript.text = this._truncateTranscriptToLineLimit(transcript, contentWidth);
    }
    const lineCount = Math.min(this._lineCount, this._visibleLines);
    this._singleLinePanelHeight = Math.min(PANEL_MAX_HEIGHT,
      Math.max(TASK_CONTROL_SIZE + TASK_CONTROL_INSET * 2, Math.ceil(metrics.lineHeight + TRANSCRIPT_VERTICAL_PADDING * 2)));
    const targetHeight = Math.min(PANEL_MAX_HEIGHT,
      Math.max(this._singleLinePanelHeight, Math.ceil(metrics.lineHeight * lineCount + TRANSCRIPT_VERTICAL_PADDING * 2 + footerHeight)));
    if (immediate || this._panelOpacity === 0 || this._panelTargetOpacity === 0) {
      this._heightTransition = undefined;
      this._panelHeight = targetHeight;
      this._contentOpacity = 1;
    } else if (targetHeight !== this._panelTargetHeight) {
      this._heightTransition = { from: this._panelHeight, elapsed: 0 };
      this._contentOpacity = 0;
    }
    this._panelTargetHeight = targetHeight;
    viewport.alignBottom = TRANSCRIPT_VERTICAL_PADDING + footerHeight;
    textTransform.size.y = this._expanded ? this._lineCount * this._lineHeight : this._singleLinePanelHeight - TRANSCRIPT_VERTICAL_PADDING * 2;
    transcript.verticalAlignment = this._expanded ? TextVerticalAlignment.Top : TextVerticalAlignment.Center;
    if (this.transcriptFooter) {
      this.transcriptFooter.entity.isActive = this._expanded && this._panelTargetOpacity > 0;
      this.transcriptFooter.text = this._lineCount > this._visibleLines
        ? "上下滑动阅读 · 横向拖走"
        : "点击收起";
    }
    this._applyPanelSize();
    this._applyPanelOpacity();

    const uiToPixelScale = resolveSeedWorldHudScale(this._width, this._height);
    const panelPixelWidth = this._panelWidth * uiToPixelScale;
    const transcriptShaderData = this.transcriptMaterial?.shaderData;
    transcriptShaderData?.setFloat(
      "material_SeedWorldPanelLeftUv",
      (this._width * 0.5 + this._panelX * uiToPixelScale - panelPixelWidth * 0.5) / this._width
    );
    transcriptShaderData?.setFloat("material_SeedWorldPanelWidthUv", panelPixelWidth / this._width);
    this._transcriptLayoutDirty = false;
  }

  private _truncateTranscriptToLineLimit(transcript: Text, contentWidth: number): string {
    const sourceText = this._sourceTranscript.replace(/\s+/g, " ");
    transcript.text = sourceText;
    if (this._measureTranscript(transcript, contentWidth).lines.length <= 1) return sourceText;

    const characters = Array.from(sourceText);
    let lowerBound = 0;
    let upperBound = characters.length;
    let bestFit = "…";
    while (lowerBound <= upperBound) {
      const midpoint = Math.floor((lowerBound + upperBound) * 0.5);
      const candidate = `${characters.slice(0, midpoint).join("").trimEnd()}…`;
      transcript.text = candidate;
      if (this._measureTranscript(transcript, contentWidth).lines.length <= 1) {
        bestFit = candidate;
        lowerBound = midpoint + 1;
      } else {
        upperBound = midpoint - 1;
      }
    }
    return bestFit;
  }

  private _measureTranscript(transcript: Text, contentWidth: number) {
    return TextUtils.measureTextWithWrap(
      transcript,
      contentWidth,
      PANEL_MAX_HEIGHT,
      transcript.lineSpacing * transcript.fontSize,
      transcript.characterSpacing * transcript.fontSize
    );
  }
}

/** Draw reusable white masks for the task-control symbols. */
function createTaskIcon(engine: Engine, retry: boolean): { sprite: Sprite; texture: Texture2D } {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.scale(4, 4);
  context.fillStyle = context.strokeStyle = "white";
  if (retry) {
    // Two clockwise arrows, matching the supplied retry symbol.
    context.lineWidth = 3.5;
    context.lineCap = context.lineJoin = "round";
    context.beginPath();
    context.arc(12, 12, 8.5, Math.PI, Math.PI * 1.77);
    context.stroke();
    context.beginPath();
    context.arc(12, 12, 8.5, 0, Math.PI * 0.77);
    context.stroke();
    context.fill(new Path2D("M21.5 2v8h-8zM2.5 22v-8h8z"));
  } else {
    context.fill(new Path2D("M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10s10-4.49 10-10S17.51 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8"));
    context.fill(new Path2D("M13 8h2v8h-2zM9 8h2v8H9z"));
  }
  const texture = new Texture2D(engine, 96, 96, TextureFormat.R8G8B8A8, false, false);
  texture.setImageSource(canvas);
  return { sprite: new Sprite(engine, texture), texture };
}

function createVoiceHudResources(engine: Engine, camera: Camera): VoiceHudResources {
  const whiteTexture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
  whiteTexture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  const whiteSprite = new Sprite(engine, whiteTexture);
  const orbShader = Shader.find(SEED_WORLD_VOICE_ORB_SHADER_NAME) ?? Shader.create(seedWorldVoiceOrbShaderSource);
  const orbMaterial = new Material(engine, orbShader);
  const transcriptShader =
    Shader.find(SEED_WORLD_WORKING_TEXT_SHADER_NAME) ?? Shader.create(seedWorldWorkingTextShaderSource);
  const transcriptMaterial = new Material(engine, transcriptShader);
  const panelGlass = new SeedWorldLiquidGlassUiMaterial(camera);
  const orbGlass = new SeedWorldLiquidGlassUiMaterial(camera);
  const controlGlass = new SeedWorldLiquidGlassUiMaterial(camera);
  controlGlass.setInteriorRefractionStrength(0.35);
  const stopIcon = createTaskIcon(engine, false);
  const retryIcon = createTaskIcon(engine, true);
  panelGlass.setOpacity(0);
  panelGlass.setInteriorRefractionStrength(0);
  orbGlass.setInteriorRefractionStrength(0);
  orbMaterial.isGCIgnored = true;
  transcriptMaterial.isGCIgnored = true;
  orbMaterial.shaderData.setFloat("material_Time", 0);
  orbMaterial.shaderData.setFloat("material_Listening", 0);
  transcriptMaterial.shaderData.setFloat("material_SeedWorldWorking", 0);
  transcriptMaterial.shaderData.setFloat("material_SeedWorldWorkingTime", 0);
  transcriptMaterial.shaderData.setFloat("material_SeedWorldPanelLeftUv", 0);
  transcriptMaterial.shaderData.setFloat("material_SeedWorldPanelWidthUv", 1);
  let destroyed = false;
  return {
    whiteTexture,
    whiteSprite,
    controlGlass,
    stopSprite: stopIcon.sprite,
    retrySprite: retryIcon.sprite,
    panelGlass,
    orbGlass,
    orbMaterial,
    transcriptMaterial,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      controlGlass.destroy();
      stopIcon.sprite.destroy();
      stopIcon.texture.destroy();
      retryIcon.sprite.destroy();
      retryIcon.texture.destroy();
      panelGlass.destroy();
      orbGlass.destroy();
      transcriptMaterial.destroy();
      orbMaterial.destroy();
      whiteSprite.destroy();
      whiteTexture.destroy();
    }
  };
}

function createVoiceHudView(options: SeedWorldChatPanelOptions, resources: VoiceHudResources): VoiceHudView {
  const root = options.root.createChild("Seed World Voice HUD");
  const canvas = root.addComponent(UICanvas);
  canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  canvas.camera = options.camera;
  canvas.sortOrder = VOICE_HUD_SORT_ORDER;
  canvas.referenceResolution.set(HUD_REFERENCE_SHORT_SIDE, HUD_REFERENCE_SHORT_SIDE);
  canvas.resolutionAdaptationMode = ResolutionAdaptationMode.ExpandAdaptation;

  const panelEntity = root.createChild("Transcript panel");
  const panelTransform = panelEntity.transform as UITransform;
  panelTransform.horizontalAlignment = HorizontalAlignmentMode.Center;
  panelTransform.verticalAlignment = VerticalAlignmentMode.Bottom;
  panelTransform.alignCenter = 0;
  panelTransform.alignBottom = PANEL_BOTTOM;
  panelTransform.size.set(PANEL_MAX_WIDTH, PANEL_MAX_HEIGHT);
  const panelImage = panelEntity.addComponent(Image);
  panelImage.sprite = resources.whiteSprite;
  panelImage.color = new Color(1, 1, 1, 1);
  panelImage.raycastEnabled = true;
  const panelPointer = panelEntity.addComponent(VoiceTranscriptPointer);
  panelPointer.scrollable = false;
  panelPointer.tracksHover = true;
  panelImage.setMaterial(resources.panelGlass.material);
  panelImage.enabled = false;

  const viewportEntity = panelEntity.createChild("Transcript viewport");
  const viewportTransform = viewportEntity.transform as UITransform;
  viewportTransform.horizontalAlignment = HorizontalAlignmentMode.LeftAndRight;
  viewportTransform.verticalAlignment = VerticalAlignmentMode.TopAndBottom;
  viewportTransform.alignLeft = TRANSCRIPT_HORIZONTAL_PADDING;
  viewportTransform.alignRight = TRANSCRIPT_HORIZONTAL_PADDING;
  viewportTransform.alignTop = TRANSCRIPT_VERTICAL_PADDING;
  viewportTransform.alignBottom = TRANSCRIPT_VERTICAL_PADDING;
  const transcriptViewport = viewportEntity.addComponent(Image);
  transcriptViewport.sprite = resources.whiteSprite;
  transcriptViewport.color = new Color(1, 1, 1, 0);
  transcriptViewport.raycastEnabled = true;
  viewportEntity.isActive = false;
  const transcriptEntity = viewportEntity.createChild("Transcript text");
  const transcriptTransform = transcriptEntity.transform as UITransform;
  transcriptTransform.horizontalAlignment = HorizontalAlignmentMode.LeftAndRight;
  transcriptTransform.verticalAlignment = VerticalAlignmentMode.Top;
  transcriptTransform.alignLeft = transcriptTransform.alignRight = 0;
  transcriptTransform.alignTop = 0;
  const transcript = transcriptEntity.addComponent(Text);
  transcript.fontSize = hudUnits(23);
  transcript.lineSpacing = 0.2;
  transcript.enableWrapping = true;
  transcript.overflowMode = OverflowMode.Overflow;
  transcript.horizontalAlignment = TextHorizontalAlignment.Left;
  transcript.verticalAlignment = TextVerticalAlignment.Center;
  transcript.color = SYSTEM_TEXT_COLOR;
  transcript.raycastEnabled = false;
  transcript.setMaterial(resources.transcriptMaterial);
  transcriptEntity.isActive = false;
  const transcriptPointer = viewportEntity.addComponent(VoiceTranscriptPointer);
  const footerEntity = panelEntity.createChild("Transcript reading controls");
  const footerTransform = footerEntity.transform as UITransform;
  footerTransform.horizontalAlignment = HorizontalAlignmentMode.LeftAndRight;
  footerTransform.alignLeft = TRANSCRIPT_HORIZONTAL_PADDING;
  footerTransform.alignRight = TRANSCRIPT_HORIZONTAL_PADDING;
  footerTransform.verticalAlignment = VerticalAlignmentMode.Bottom;
  footerTransform.alignBottom = hudUnits(12);
  footerTransform.size.set(1, TRANSCRIPT_FOOTER_HEIGHT);
  const footer = footerEntity.addComponent(Text);
  footer.fontSize = hudUnits(14);
  footer.raycastEnabled = true;
  footer.color = new Color(1, 1, 1, 0.75);
  footer.horizontalAlignment = TextHorizontalAlignment.Left;
  footer.verticalAlignment = TextVerticalAlignment.Center;
  const footerPointer = footerEntity.addComponent(VoiceTranscriptPointer);
  footerPointer.scrollable = false;
  footerEntity.isActive = false;

  const orbEntity = root.createChild("Siri voice orb");
  const orbTransform = orbEntity.transform as UITransform;
  orbTransform.horizontalAlignment = HorizontalAlignmentMode.Center;
  orbTransform.verticalAlignment = VerticalAlignmentMode.Bottom;
  orbTransform.alignCenter = 0;
  orbTransform.alignBottom = ORB_BOTTOM;
  orbTransform.size.set(ORB_SIZE, ORB_SIZE);
  const orbGlassImage = orbEntity.addComponent(Image);
  orbGlassImage.sprite = resources.whiteSprite;
  orbGlassImage.color = new Color(1, 1, 1, 1);
  orbGlassImage.setMaterial(resources.orbGlass.material);

  const orbVisualEntity = orbEntity.createChild("Siri voice orb visual");
  const orbVisualTransform = orbVisualEntity.transform as UITransform;
  orbVisualTransform.horizontalAlignment = HorizontalAlignmentMode.LeftAndRight;
  orbVisualTransform.verticalAlignment = VerticalAlignmentMode.TopAndBottom;
  orbVisualTransform.alignLeft = 0;
  orbVisualTransform.alignRight = 0;
  orbVisualTransform.alignTop = 0;
  orbVisualTransform.alignBottom = 0;
  const orbVisual = orbVisualEntity.addComponent(Image);
  orbVisual.sprite = resources.whiteSprite;
  orbVisual.color = new Color(1, 1, 1, 1);
  orbVisual.raycastEnabled = false;
  orbVisual.setMaterial(resources.orbMaterial);

  const controlEntity = panelEntity.createChild("Stop or retry unfinished task");
  const controlTransform = controlEntity.transform as UITransform;
  controlTransform.horizontalAlignment = HorizontalAlignmentMode.Right;
  controlTransform.verticalAlignment = VerticalAlignmentMode.Middle;
  controlTransform.alignRight = TASK_CONTROL_INSET;
  controlTransform.size.set(TASK_CONTROL_SIZE, TASK_CONTROL_SIZE);
  const controlImage = controlEntity.addComponent(Image);
  controlImage.sprite = resources.whiteSprite;
  controlImage.setMaterial(resources.controlGlass.material);
  const controlButton = controlEntity.addComponent(VoiceTaskButton);
  const iconEntity = controlEntity.createChild("Task control icon");
  const iconTransform = iconEntity.transform as UITransform;
  iconTransform.horizontalAlignment = HorizontalAlignmentMode.Center;
  iconTransform.verticalAlignment = VerticalAlignmentMode.Middle;
  iconTransform.size.set(hudUnits(32), hudUnits(32));
  const controlIcon = iconEntity.addComponent(Image);
  controlIcon.sprite = resources.stopSprite;
  controlIcon.raycastEnabled = false;

  const pendingEntity = root.createChild("Pending inputs");
  const pendingTransform = pendingEntity.transform as UITransform;
  pendingTransform.horizontalAlignment = HorizontalAlignmentMode.Center;
  pendingTransform.verticalAlignment = VerticalAlignmentMode.Bottom;
  pendingTransform.alignCenter = hudUnits(110);
  pendingTransform.alignBottom = ORB_BOTTOM;
  pendingTransform.size.set(hudUnits(100), ORB_SIZE);
  const pendingLabel = pendingEntity.addComponent(Text);
  pendingLabel.fontSize = hudUnits(18);
  pendingLabel.horizontalAlignment = TextHorizontalAlignment.Center;
  pendingLabel.verticalAlignment = TextVerticalAlignment.Center;
  pendingLabel.color = CONTENT_TEXT_COLOR;
  pendingLabel.raycastEnabled = false;
  const layout = root.addComponent(VoiceHudLayout);
  controlButton.layout = layout;
  layout.controlButton = controlButton;
  layout.controlGlass = resources.controlGlass;
  layout.controlIcon = controlIcon;
  layout.panelImage = panelImage;
  layout.panelGlass = resources.panelGlass;
  layout.panelTransform = panelTransform;
  layout.orbGlass = resources.orbGlass;
  layout.orbMaterial = resources.orbMaterial;
  layout.transcriptMaterial = resources.transcriptMaterial;
  layout.orbTransform = orbTransform;
  layout.transcriptViewport = transcriptViewport;
  layout.transcript = transcript;
  layout.transcriptFooter = footer;
  layout.readingPointers = [transcriptPointer, footerPointer, panelPointer];
  transcriptPointer.layout = footerPointer.layout = panelPointer.layout = layout;
  return {
    root,
    controlButton, controlImage, controlIcon, pendingLabel,
    orbEntity,
    transcript,
    orbMaterial: resources.orbMaterial,
    transcriptMaterial: resources.transcriptMaterial,
    layout,
    resources
  };
}

function getAsrDisplayMessage(value: AsrError): string {
  if (value.error === "no-speech") return "未识别到文字";
  if (value.error === "unsupported") return "暂不支持语音";
  if (value.error === "not-allowed") return "请允许麦克风权限后重试。";
  if (value.error === "audio-capture") return "未检测到可用麦克风。";
  if (value.error === "network") return "语音识别网络异常，请重试。";
  return "语音识别失败，请重试。";
}

function getFeedbackDismissPolicy(category: FeedbackCategory): FeedbackDismissPolicy {
  if (category === "invalid-speech" || category === "asr-unavailable") {
    return {
      visibleMilliseconds: BRIEF_FEEDBACK_VISIBLE_MILLISECONDS,
      fadeOutSeconds: BRIEF_FEEDBACK_FADE_OUT_SECONDS
    };
  }
  return {
    visibleMilliseconds: category === "asr-error" ? ASR_ERROR_VISIBLE_MILLISECONDS : RESULT_VISIBLE_MILLISECONDS,
    fadeOutSeconds: PANEL_FADE_OUT_SECONDS
  };
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
