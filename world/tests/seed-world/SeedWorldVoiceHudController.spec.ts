vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", async importOriginal => ({ ...await importOriginal<object>(), requestAsapChat: vi.fn() }));
import { requestAsapChat } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";
import { createTestAgentLoop } from "../../../packages/ai-chat/tests/AIChatTestRuntime";
import { SeedWorldSessionActivity } from "../../demos/seed-world/assistant/SeedWorldSessionActivity";
import { SessionData, type AgentSessionSnapshot } from "@galacean/engine-ai-chat/ai-chat/session-data.ts";
import { AIChatSession } from "@galacean/engine-ai-chat/ai-chat/ai-chat-session.ts";
import { SeedWorldTurnGesture, turnDragIntent, turnAnchorOffset, turnThrow } from "../../demos/seed-world/assistant/SeedWorldTurnGesture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AgentTraceStore,
  type AgentRunOptions,
  type AgentInputPreparation,
  type AgentEvent,
  type AgentInputTarget,
  type AsrClient,
  type AsrDiagnostics,
  type AsrError,
  type AsrSession,
  type AsrSessionOutcome,
  type AsrStartOptions
} from "@galacean/engine-ai-chat/ai-chat/index.ts";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
}>;

type ControlledAsrSession = AsrSession & Readonly<{ release(): void }>;

class ControlledAsrClient implements AsrClient {
  readonly availability = Promise.resolve({
    available: true as const,
    provider: "native" as const,
    protocolVersion: 1
  });
  readonly sessions: ControlledAsrSession[] = [];
  startCount = 0;
  abortCount = 0;
  private _activeSession: ControlledAsrSession | undefined;
  private _nextAbortFailure: AsrError | undefined;

  failNextAbort(): void {
    this._nextAbortFailure = {
      error: "engine",
      message: "native abort failed",
      fatal: true,
      sessionId: "controlled-asr",
      code: "ASR_ABORT_FAILED"
    };
  }

  getDiagnostics(): AsrDiagnostics {
    return {
      capturedAt: new Date().toISOString(),
      runtime: {
        isSecureContext: true,
        isTopLevel: false,
        hasCandyJarCall: false,
        hasLingguang: true,
        hasNativeAsr: true,
        hasNativeStart: true,
        hasNativeStop: true,
        hasNativeAbort: true,
        hasCanIUse: true
      },
      events: []
    };
  }

  subscribeDiagnostics(): () => void {
    return () => undefined;
  }

  start(_options: AsrStartOptions): AsrSession {
    this.startCount += 1;
    if (this._activeSession) {
      throw Object.assign(new Error("上一轮语音识别仍在清理"), { code: "ASR_CLEANUP_PENDING" });
    }
    const id = `controlled-asr-${this.sessions.length + 1}`;
    const done = createDeferred<AsrSessionOutcome>();
    const released = createDeferred<void>();
    const aborted: AsrSessionOutcome = { status: "aborted", sessionId: id, text: "", reason: "abort" };
    const abortFailure = this._nextAbortFailure;
    this._nextAbortFailure = undefined;
    const failedAbort: AsrSessionOutcome | undefined = abortFailure
      ? {
          status: "failed",
          sessionId: id,
          text: "",
          reason: "error",
          error: { ...abortFailure, sessionId: id }
        }
      : undefined;
    const completed: AsrSessionOutcome = { status: "completed", sessionId: id, text: "", reason: "stop" };
    let settled = false;
    const settle = (outcome: AsrSessionOutcome): AsrSessionOutcome => {
      if (!settled) {
        settled = true;
        done.resolve(outcome);
      }
      return outcome;
    };
    const session: ControlledAsrSession = {
      id,
      ready: Promise.resolve(),
      done: done.promise,
      released: released.promise,
      stop: async () => settle(completed),
      abort: async () => {
        this.abortCount += 1;
        return settle(failedAbort ?? aborted);
      },
      release: () => released.resolve()
    };
    this.sessions.push(session);
    this._activeSession = session;
    void session.released.then(() => {
      if (this._activeSession === session) this._activeSession = undefined;
    });
    return session;
  }

  destroy(): void {
    this._activeSession?.release();
    this._activeSession = undefined;
  }
}

describe("SeedWorldVoiceHudController lifecycle", () => {
  it("shows current model progress and retains the submitted requirement in details", async () => {
    const f = await createControllerFixture();
    f.traceStore.setEnabled(false);
    f.emit({ type: "task_started", taskId: "real", input: "原始需求", inputSource: "text" });
    expect(f.view.layout.setTranscript).toHaveBeenLastCalledWith("原始需求");
    f.emit({ type: "model_started", taskId: "real", step: 1 });
    expect(f.view.layout.setTranscript).toHaveBeenLastCalledWith("正在分析请求");
    f.emit({ type: "model_finished", taskId: "real", step: { step: 1,
      decision: { type: "execute", code: "return {}" },
      attempts: [{ attempt: 1, rawContent: "先检查天气，再核对时间。", error: null }] } });
    expect(f.view.layout.setTranscript).toHaveBeenLastCalledWith("先检查天气，再核对时间。");
    expect(f.view.layout.setTranscriptDetails).toHaveBeenLastCalledWith("原始需求\n\n先检查天气，再核对时间。");
    f.emit({ type: "model_started", taskId: "real", step: 2 });
    expect(f.view.layout.setTranscript).toHaveBeenLastCalledWith("正在分析请求");
    expect(f.view.layout.setTranscriptDetails).toHaveBeenLastCalledWith("原始需求\n\n先检查天气，再核对时间。");
    f.controller.destroy();
  });

  it("collapses completed details after nine seconds, then fades after another nine", async () => {
    const f = await createControllerFixture();
    vi.useFakeTimers();
    try {
      await f.controller.submit("查询时间");
      expect(f.view.layout.expanded).toBe(true);
      vi.advanceTimersByTime(8_999);
      expect(f.view.layout.expanded).toBe(true);
      vi.advanceTimersByTime(1);
      expect(f.view.layout.expanded).toBe(false);
      expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(true, undefined);
      vi.advanceTimersByTime(8_999);
      expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(true, undefined);
      vi.advanceTimersByTime(1);
      expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(false, 0.32);
      f.emit({ type: "session_state", state: "idle", canContinue: false });
      expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(false, 0.32);
    } finally { f.controller.destroy(); vi.useRealTimers(); }
  });

  it("restarts the current nine-second window on reading, reopening, and clicks without details", async () => {
    const f = await createControllerFixture();
    vi.useFakeTimers();
    try {
      await f.controller.submit("查询时间");
      vi.advanceTimersByTime(8_000);
      f.view.layout.onReadInteraction?.(true);
      vi.advanceTimersByTime(20_000);
      expect(f.view.layout.expanded).toBe(true);
      f.view.layout.onReadInteraction?.(false);
      vi.advanceTimersByTime(8_000);
      f.view.layout.onReadActivity?.(); // wheel scrolling
      vi.advanceTimersByTime(8_999);
      expect(f.view.layout.expanded).toBe(true);
      vi.advanceTimersByTime(1);
      expect(f.view.layout.expanded).toBe(false);
      vi.advanceTimersByTime(8_000);
      f.view.layout.setExpanded(true);
      vi.advanceTimersByTime(8_999);
      expect(f.view.layout.expanded).toBe(true);
      vi.advanceTimersByTime(1);
      expect(f.view.layout.expanded).toBe(false);
      vi.advanceTimersByTime(8_000);
      f.view.layout.onReadActivity?.(); // click on a short reply with no extra detail
      vi.advanceTimersByTime(8_999);
      expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(true, undefined);
      vi.advanceTimersByTime(1);
      expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(false, 0.32);
    } finally { f.controller.destroy(); vi.useRealTimers(); }
  });

  it("pauses the current cooldown while hovered and restarts it on mouse exit", async () => {
    const f = await createControllerFixture();
    vi.useFakeTimers();
    try {
      await f.controller.submit("查询时间");
      vi.advanceTimersByTime(8_000);
      f.view.layout.hovered = true;
      f.view.layout.onHoverChange?.();
      vi.advanceTimersByTime(30_000);
      expect(f.view.layout.expanded).toBe(true);
      f.view.layout.hovered = false;
      f.view.layout.onHoverChange?.();
      vi.advanceTimersByTime(8_999);
      expect(f.view.layout.expanded).toBe(true);
      vi.advanceTimersByTime(1);
      expect(f.view.layout.expanded).toBe(false);
      vi.advanceTimersByTime(9_000);
      expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(false, 0.32);
      expect(f.runAgent).toHaveBeenCalledOnce();
    } finally { f.controller.destroy(); vi.useRealTimers(); }
  });

  it("cancels dismissal during reading or a new task and keeps active and resumable tasks visible", async () => {
    const f = await createControllerFixture();
    vi.useFakeTimers();
    try {
      await f.controller.submit("first");
      f.view.layout.expanded = false;
      f.view.layout.onExpandedChange?.();
      vi.advanceTimersByTime(8_000);
      f.view.layout.onReadInteraction?.(true);
      vi.advanceTimersByTime(20_000);
      expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(true, undefined);
      f.view.layout.onReadInteraction?.(false);
      vi.advanceTimersByTime(8_000);
      f.session.running = true;
      f.session.state = "executing";
      f.emit({ type: "task_started", taskId: "new", input: "new", inputSource: "text" });
      vi.advanceTimersByTime(20_000);
      expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(true, undefined);
      f.session.running = false;
      f.session.state = "stopped";
      f.session.canContinue = true;
      f.emit({ type: "task_failed", taskId: "new", error: new Error("cancelled"), steps: [], failure: {
        taskId: "new", input: "new", inputSource: "text", status: "cancelled", message: "cancelled",
        result: { status: "cancelled", message: "cancelled" }, stageResults: [], steps: []
      } });
      f.view.layout.expanded = false;
      f.view.layout.onExpandedChange?.();
      vi.advanceTimersByTime(20_000);
      expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(true, undefined);
    } finally {
      f.controller.destroy();
      vi.useRealTimers();
    }
  });

  it("discards a completed glass bar and rejects competing controls while the bar owns input", async () => {
    const f = await createControllerFixture();
    await f.controller.submit("finished");
    const dismiss = f.controller.beginTurnDismissGesture()!;
    expect(dismiss).toBeTypeOf("function");
    dismiss();
    expect(f.session.stop).not.toHaveBeenCalled();
    expect(f.session.continue).not.toHaveBeenCalled();
    expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(false, 0.22);
    f.session.running = true;
    f.session.state = "executing";
    f.emit({ type: "task_started", taskId: "new", input: "new", inputSource: "text" });
    f.view.layout.onReadInteraction?.(true);
    expect(f.controller.beginTaskControlGesture()).toBeUndefined();
    dismiss(); // an old bar must never hide a new turn
    expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(true, undefined);
    expect(f.session.stop).not.toHaveBeenCalled();
    const runningDismiss = f.controller.beginTurnDismissGesture()!;
    runningDismiss();
    expect(f.session.stop).toHaveBeenCalledOnce();
    f.view.layout.onReadInteraction?.(false);
    f.controller.destroy();
  });

  it("shows listening immediately on press before asynchronous ASR startup", async () => {
    const f = await createControllerFixture();
    f.controller.handlePointerDown(57);
    expect(f.view.layout.setTranscript).toHaveBeenLastCalledWith("我在听");
    expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(true);
    f.controller.handlePointerCancel(57);
    await Promise.resolve();
    f.controller.destroy();
  });

  it("forwards an explicit diagnostic compaction budget through submit and resets to server defaults", async () => {
    const fixture = await createControllerFixture();
    const { createSeedWorldAgentDebug } = await import("../../demos/seed-world/assistant/SeedWorldAgentDebug");
    const debug = createSeedWorldAgentDebug(new AgentTraceStore(), {
      setContextCompactionBudget: budget => fixture.controller.setContextCompactionBudget(budget)
    });
    const budget = { triggerTokens: 12000, targetTokens: 6000 };
    debug.setContextCompactionBudget(budget);
    budget.targetTokens = 5000;
    await fixture.controller.submit("task");
    expect(fixture.runAgent).toHaveBeenLastCalledWith("task", expect.objectContaining({
      contextCompaction: { triggerTokens: 12000, targetTokens: 6000 }
    }), "next-step");
    expect(fixture.traceStore.getLastTrace()?.input.text).toBe("task");
    debug.setContextCompactionBudget(undefined);
    await fixture.controller.submit("next task");
    expect(fixture.runAgent.mock.calls.at(-1)![1]).not.toHaveProperty("contextCompaction");
    expect(() => debug.setContextCompactionBudget({ triggerTokens: 10, targetTokens: 20 })).toThrow();
    fixture.controller.destroy();
    expect(() => debug.setContextCompactionBudget({ triggerTokens: 100 })).toThrow("destroyed");
    debug.destroy();
  });
  it("accepts steering and followups while executing and exposes stop/continue controls", async () => {
    const fixture = await createControllerFixture();
    fixture.session.running = true;
    fixture.session.state = "executing";
    fixture.emit({ type: "task_started", taskId: "original", input: "original", inputSource: "text" });
    await fixture.controller.submit("supplement");
    expect(fixture.runAgent).toHaveBeenLastCalledWith("supplement", expect.objectContaining({
      context: expect.objectContaining({ viewer_at_submission: { position: { x: 1, y: 2, z: 3 } } })
    }), "next-step");
    await fixture.controller.submit("later", "text", "next-turn");
    expect(fixture.runAgent.mock.calls.at(-1)?.[2]).toBe("next-turn");
    await fixture.controller.submit("another supplement");
    expect(fixture.runAgent.mock.calls.at(-1)?.[2]).toBe("next-step");
    await fixture.controller.stop();
    expect(fixture.session.stop).toHaveBeenCalledOnce();
    fixture.session.running = false;
    fixture.session.state = "stopped";
    fixture.session.canContinue = true;
    fixture.emit({ type: "session_state", state: "stopped", canContinue: true });
    expect(fixture.view.controlButton.interactive).toBe(true);
    expect(fixture.view.controlIcon.sprite).toBe(fixture.view.resources.retrySprite);
    await fixture.controller.continue();
    expect(fixture.session.continue).toHaveBeenCalledOnce();
    fixture.controller.destroy();
  });

  it("acts only on release and keeps discarded turns hidden through cancellation events", async () => {
    const f = await createControllerFixture();
    f.session.running = true;
    f.session.state = "executing";
    f.emit({ type: "task_started", taskId: "one", input: "one", inputSource: "text" });
    const gesture = f.controller.beginTaskControlGesture()!;
    expect(f.session.stop).not.toHaveBeenCalled();
    gesture.dismiss();
    expect(f.session.stop).toHaveBeenCalledOnce();
    f.emit({ type: "session_state", state: "stopping", canContinue: false });
    expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(false, undefined);
    expect(f.view.controlButton.entity.isActive).toBe(false);
    f.session.running = false;
    f.session.state = "stopped";
    f.session.canContinue = true;
    f.emit({ type: "session_state", state: "stopped", canContinue: true });
    expect(f.view.controlButton.entity.isActive).toBe(false);
    f.session.running = true;
    f.session.state = "executing";
    f.emit({ type: "task_started", taskId: "two", input: "two", inputSource: "text" });
    expect(f.view.layout.setPanelVisible).toHaveBeenLastCalledWith(true, undefined);
    expect(f.view.controlButton.entity.isActive).toBe(true);
    gesture.click(); // a stale release must not stop the new turn
    expect(f.session.stop).toHaveBeenCalledOnce();
    f.controller.destroy();
  });

  it("discards a stopped turn without resuming and disables gestures while stopping", async () => {
    const f = await createControllerFixture();
    f.session.state = "stopped";
    f.session.canContinue = true;
    const click = f.controller.beginTaskControlGesture()!;
    expect(f.session.continue).not.toHaveBeenCalled();
    click.click();
    expect(f.session.continue).toHaveBeenCalledOnce();
    const dismiss = f.controller.beginTaskControlGesture()!;
    dismiss.dismiss();
    expect(f.session.continue).toHaveBeenCalledOnce();
    expect(f.session.stop).not.toHaveBeenCalled();
    f.emit({ type: "task_started", taskId: "new", input: "new", inputSource: "text" });
    f.session.state = "stopping";
    expect(f.controller.beginTaskControlGesture()).toBeUndefined();
    f.controller.destroy();
  });

  it("keeps the Agent trace and viewer when an overlapping voice interaction is cancelled", async () => {
    const fixture = await createControllerFixture();
    fixture.session.running = true;
    fixture.emit({ type: "task_started", taskId: "original", input: "plant", inputSource: "text",
      context: { viewer_at_submission: { position: { x: 10, y: 0, z: 0 } } } });
    fixture.controller.handlePointerDown(42);
    await vi.waitFor(() => expect(fixture.controller.listening).toBe(true));
    fixture.controller.handlePointerCancel(42);
    fixture.asrClient.sessions[0].release();
    await flushMicrotasks();
    expect(fixture.traceStore.getCurrentTrace()).toMatchObject({ taskId: "original", status: "running", input: { text: "plant" } });
    expect(fixture.traceStore.getLastTrace()?.status).toBe("cancelled");
    const release = fixture.application.captureTaskViewerSnapshot.mock.results[0].value;
    fixture.emit({ type: "input_consumed", taskId: "original", input: { id: "more", text: "here", inputSource: "text",
      context: { viewer_at_submission: { position: { x: 20, y: 0, z: 0 } } } } });
    expect(release).toHaveBeenCalledOnce();
    expect(fixture.application.captureTaskViewerSnapshot).toHaveBeenLastCalledWith({ position: { x: 20, y: 0, z: 0 } }, "more");
    fixture.controller.destroy();
  });

  it("removes complete emoji graphemes only at the chat display boundary", async () => {
    const { stripSeedWorldChatDisplayEmoji } = await import("../../demos/seed-world/assistant/SeedWorldChatPanel");

    expect(stripSeedWorldChatDisplayEmoji("已生成一棵树 🌳，完成✅。"))
      .toBe("已生成一棵树 ，完成。");
    expect(stripSeedWorldChatDisplayEmoji("家庭👨‍👩‍👧‍👦、手势👍🏽、国旗🇨🇳和步骤1️⃣"))
      .toBe("家庭、手势、国旗和步骤");
    expect(stripSeedWorldChatDisplayEmoji("温度 20°C，进度 100%，© 2026，♥︎，请沿 A→B 移动。"))
      .toBe("温度 20°C，进度 100%，© 2026，♥︎，请沿 A→B 移动。");
    expect(stripSeedWorldChatDisplayEmoji("印地语字素 क्‍ष 不能被删除。"))
      .toBe("印地语字素 क्‍ष 不能被删除。");
  });

  it.each([[393, 852], [1024, 1366]])("keeps HUD scale stable through rotation at %s x %s", async (width, height) => {
    const { resolveSeedWorldHudScale: scale } = await import("../../demos/seed-world/src/SeedWorldHudLayout");
    const portrait = scale(width, height);
    expect(portrait).toBeCloseTo(width / 720);
    expect(scale(height, width)).toBe(portrait);
    expect(scale(width, height)).toBe(portrait);
    // Backbuffer density changes must not change the CSS size of the controls.
    expect(scale(width * 2, height * 2) / 2).toBe(portrait);
  });



  it("keeps the first Siri session alive while the native permission prompt blurs the WebView", async () => {
    const fixture = await createControllerFixture();
    fixture.controller.handlePointerDown(11);
    await vi.waitFor(() => expect(fixture.controller.listening).toBe(true));

    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    await flushMicrotasks();

    expect(fixture.controller.listening).toBe(true);
    expect(fixture.controller.busy).toBe(true);
    expect(fixture.asrClient.startCount).toBe(1);
    expect(fixture.asrClient.abortCount).toBe(0);
    expect(fixture.traceStore.getCurrentTrace()).toMatchObject({
      status: "running",
      asr: {
        interactionEvents: expect.arrayContaining([
          expect.objectContaining({ type: "window.blur" }),
          expect.objectContaining({ type: "window.focus" })
        ])
      }
    });
    expect(fixture.traceStore.getCurrentTrace()?.asr?.interactionEvents).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "interaction.interrupted" })])
    );

    fixture.controller.destroy();
    await flushMicrotasks();
  });

  it("ends a permission-cancelled hold and allows the next Siri press after cleanup", async () => {
    const fixture = await createControllerFixture();
    fixture.controller.handlePointerDown(12);
    await vi.waitFor(() => expect(fixture.controller.listening).toBe(true));

    window.dispatchEvent(new Event("blur"));
    fixture.controller.handlePointerCancel(12);
    window.dispatchEvent(new Event("focus"));

    expect(fixture.controller.listening).toBe(false);
    expect(fixture.controller.busy).toBe(true);
    expect(fixture.asrClient.abortCount).toBe(1);

    fixture.asrClient.sessions[0].release();
    await vi.waitFor(() => expect(fixture.controller.busy).toBe(false));
    fixture.controller.handlePointerDown(13);
    await vi.waitFor(() => expect(fixture.controller.listening).toBe(true));

    expect(fixture.asrClient.startCount).toBe(2);
    expect(fixture.traceStore.getTraces()).toMatchObject([
      {
        status: "cancelled",
        asr: {
          interactionEvents: expect.arrayContaining([
            expect.objectContaining({ type: "window.blur" }),
            expect.objectContaining({ type: "pointer.cancel", pointerId: 12 }),
            expect.objectContaining({ type: "interaction.interrupted" })
          ])
        }
      }
    ]);

    fixture.controller.destroy();
    await flushMicrotasks();
  });

  it("serializes a public voice retry after the document is actually hidden and preserves both traces", async () => {
    const fixture = await createControllerFixture();
    fixture.controller.handlePointerDown(101);
    await vi.waitFor(() => expect(fixture.controller.listening).toBe(true));
    const firstInteractionId = fixture.traceStore.getCurrentTrace()?.interactionId;

    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.controller.listening).toBe(false);
    expect(fixture.controller.busy).toBe(true);

    const retry = fixture.controller.startListening();
    await flushMicrotasks();
    expect(fixture.asrClient.startCount).toBe(1);
    expect(fixture.traceStore.getCurrentTrace()).toMatchObject({
      interactionId: firstInteractionId,
      status: "running"
    });

    fixture.asrClient.sessions[0].release();
    await retry;

    expect(fixture.asrClient.startCount).toBe(2);
    expect(fixture.controller.listening).toBe(true);
    expect(fixture.traceStore.getTraces()).toMatchObject([
      {
        interactionId: firstInteractionId,
        status: "cancelled",
        asr: {
          interactionEvents: expect.arrayContaining([
            expect.objectContaining({ type: "document.hidden" }),
            expect.objectContaining({ type: "interaction.interrupted" })
          ])
        }
      }
    ]);
    expect(fixture.traceStore.getCurrentTrace()).toMatchObject({ status: "running" });

    fixture.controller.destroy();
    await flushMicrotasks();
  });

  it("does not let a public text submission replace an ASR trace that is still cleaning up", async () => {
    const fixture = await createControllerFixture();
    fixture.controller.handlePointerDown(202);
    await vi.waitFor(() => expect(fixture.controller.listening).toBe(true));
    const firstInteractionId = fixture.traceStore.getCurrentTrace()?.interactionId;

    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    const submission = fixture.controller.submit("只返回当前世界的 Root Seed");
    await flushMicrotasks();
    expect(fixture.runAgent).not.toHaveBeenCalled();
    expect(fixture.traceStore.getCurrentTrace()).toMatchObject({
      interactionId: firstInteractionId,
      status: "running"
    });

    fixture.asrClient.sessions[0].release();
    await submission;

    expect(fixture.runAgent).toHaveBeenCalledOnce();
    expect(fixture.traceStore.getTraces().map((trace) => trace.status)).toEqual(["cancelled", "completed"]);

    fixture.controller.destroy();
  });

  it("unblocks the HUD and text input when native abort fails without a release callback", async () => {
    const fixture = await createControllerFixture();
    fixture.asrClient.failNextAbort();
    fixture.controller.handlePointerDown(303);
    await vi.waitFor(() => expect(fixture.controller.listening).toBe(true));

    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(fixture.controller.busy).toBe(false));

    expect(fixture.asrClient.abortCount).toBe(1);
    expect(fixture.traceStore.getLastTrace()).toMatchObject({
      status: "cancelled",
      asr: {
        error: { code: "ASR_ABORT_FAILED" },
        interactionEvents: expect.arrayContaining([expect.objectContaining({ type: "asr.cleanup_failed" })])
      }
    });

    await fixture.controller.submit("只返回当前世界的 Root Seed");
    expect(fixture.runAgent).toHaveBeenCalledOnce();

    fixture.controller.destroy();
  });
});

async function createControllerFixture(realSession?: AIChatSession, activity?: SeedWorldSessionActivity) {
  const { SeedWorldVoiceHudController } = await import("../../demos/seed-world/assistant/SeedWorldChatPanel");
  const traceStore = activity?.trace ?? new AgentTraceStore({ enabled: true });
  const asrClient = new ControlledAsrClient();
  const listeners = new Set<(event: AgentEvent) => void>();
  const data = new SessionData();
  const stateListeners = new Set<(snapshot: AgentSessionSnapshot) => void>();
  const emit = (event: AgentEvent) => {
    if (event.type === "task_started") {
      data.begin({ id: event.inputId ?? event.taskId, text: event.input, inputSource: event.inputSource }, {}, 0);
      session.state = "executing"; session.running = true;
      // A real Session publishes its execution before AgentLoop.task_started.
      for (const listener of stateListeners) listener(session.snapshot);
    }
    if (event.type === "session_state") { session.state = event.state; session.canContinue = event.canContinue; }
    if (event.type === "task_completed") { session.state = "idle"; session.running = false; }
    data.accept(event);
    for (const listener of listeners) listener(event);
    for (const listener of stateListeners) listener(session.snapshot);
  };
  const runAgent = vi.fn(async (input: string, options: AgentRunOptions, target: AgentInputTarget) => {
    emit({ type: "task_started", taskId: "task", input, inputSource: options.inputSource ?? "text", inputId: "input", context: options.context });
    const result = { taskId: "task", input, inputSource: options.inputSource ?? "text", finalMessage: "完成",
      result: { status: "completed" as const, message: "完成", output: null }, stageResults: [], steps: [] };
    emit({ type: "task_completed", taskId: "task", result });
    return result;
  });
  const session = {
    running: false,
    state: "idle",
    get snapshot() { return data.snapshot(session.state as AgentSessionSnapshot["state"], session.canContinue, false, []); },
    get canStop() { return session.state === "preparing" || session.state === "executing"; },
    subscribeState: (listener: (snapshot: AgentSessionSnapshot) => void) => {
      stateListeners.add(listener); listener(session.snapshot); return () => stateListeners.delete(listener);
    },
    pendingInputs: [],
    canContinue: false,
    subscribe: (listener: (event: AgentEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    run: runAgent,
    submit: (input: string, options: AgentRunOptions, target: AgentInputTarget, preparation?: AgentInputPreparation) => {
      emit({ type: "input_queued", input: { id: "input", text: input, inputSource: options.inputSource ?? "text" }, target });
      return { id: "input", completion: (async () => {
        try { await preparation?.prepare(new AbortController().signal); return await runAgent(input, options, target); }
        finally { preparation?.release(); }
      })() };
    },
    cancel: vi.fn(),
    stop: vi.fn(async () => undefined),
    continue: vi.fn(async () => ({ id: "input", completion: Promise.resolve(undefined) })),
    dispose: vi.fn()
  };
  let presentation = "voice";
  const layout = {
    controller: undefined,
    expanded: false,
    hovered: false,
    onHoverChange: undefined as (() => void) | undefined,
    onExpandedChange: undefined as (() => void) | undefined,
    onReadActivity: undefined as (() => void) | undefined,
    setExpanded: vi.fn((expanded: boolean): void => {
      if (layout.expanded === expanded) return;
      layout.expanded = expanded;
      layout.onExpandedChange?.();
    }),
    onReadInteraction: undefined as ((active: boolean) => void) | undefined,
    cancelReading: vi.fn(),
    resetTranscript: vi.fn((): void => { layout.expanded = false; }),
    setPresentation: vi.fn((mode: string): void => {
      if (presentation !== mode) {
        presentation = mode;
        layout.expanded = mode === "result";
      }
    }),
    setTranscriptDetails: vi.fn(),
    hidePanelImmediately: vi.fn(),
    resetPanelPosition: vi.fn(),
    setControlVisible: vi.fn(),
    setControlIconOpacity: vi.fn(),
    dismissing: false,
    setTranscriptWorking: vi.fn(),
    setPanelVisible: vi.fn(),
    setTranscript: vi.fn(),
    setTranscriptColor: vi.fn()
  };
  const view = {
    root: { isActive: true, destroy: vi.fn() },
    controlButton: { entity: { isActive: false }, interactive: false, cancelGesture: vi.fn() },
    controlImage: { color: { set: vi.fn() } },
    controlIcon: { sprite: undefined as unknown, color: { set: vi.fn() } },
    pendingLabel: { text: "", entity: { isActive: false } },
    orbMaterial: { shaderData: { setFloat: vi.fn() } },
    layout,
    resources: { destroy: vi.fn(), stopSprite: {}, retrySprite: {} }
  };
  const debugController = {
    enable: vi.fn(),
    destroy: vi.fn()
  };
  const application = {
    getUserSelection: () => null,
    getWorldContext: () => ({ world: { rootSeed: 1729 } }),
    getViewerSnapshot: () => ({ position: { x: 1, y: 2, z: 3 } }),
    captureTaskViewerSnapshot: vi.fn(() => vi.fn())
  };
  activity ??= new SeedWorldSessionActivity(realSession ?? session as never, application as never, traceStore);
  const controller = new SeedWorldVoiceHudController(
    {
      application,
      engine: undefined,
      camera: undefined,
      root: view.root,
      setWorldInputEnabled: vi.fn(),
      traceEnabled: true
    } as never,
    realSession ?? session as never,
    view as never,
    activity,
    debugController as never,
    () => ({ minimumMilliseconds: 0, textSettleMilliseconds: 0, maximumMilliseconds: 0 }),
    asrClient
  );
  return { controller, traceStore, asrClient, runAgent, emit, session, application, view, activity };
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function setDocumentVisibility(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: visibilityState });
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}


describe("turn pill pointer arbitration", () => {
  it("anchors at the press position and requires a far release to dismiss", () => {
    const g = new SeedWorldTurnGesture();
    expect(g.begin(1, 240, 80)).toBe(true);
    expect(g.begin(2, 0, 0)).toBe(false);
    expect(g.move(2, 900, 900)).toBe(false);
    expect(g.move(1, 360, 110)).toBe(true);
    expect([g.x, g.y]).toEqual([120, 30]);
    expect(g.finish(2)).toBeUndefined();
    expect(g.finish(1)).toBe("dismiss");
    expect(g.finish(1)).toBeUndefined();
  });
  it("clicks on release, but short drags and out-and-back drags return without clicking", () => {
    const g = new SeedWorldTurnGesture();
    g.begin(1, 100, 100);
    g.move(1, 103, 102);
    expect(g.finish(1)).toBe("click");
    g.begin(1, 100, 100);
    g.move(1, 120, 100);
    expect(g.finish(1)).toBe("return");
    g.begin(1, 100, 100);
    g.move(1, 260, 100);
    g.move(1, 100, 100);
    expect(g.finish(1)).toBe("return");
  });
  it("uses recent release velocity without making a fast short drag discard", () => {
    const g = new SeedWorldTurnGesture();
    g.begin(1, 0, 0, 0);
    g.move(1, 45, 0, 15);
    g.move(1, 90, 0, 30);
    expect(g.velocity(30)).toEqual({ x: 3000, y: 0 });
    expect(g.finish(1)).toBe("return");
    expect(g.velocity(200)).toEqual({ x: 0, y: 0 });
    const slow = turnThrow(150, 0, { x: 0, y: 0 });
    const fast = turnThrow(150, 0, { x: 0, y: 3000 });
    expect(slow.x).toBeGreaterThan(150);
    expect(fast.x).toBe(150); // follows the latest upward stroke, not the original displacement
    expect(fast.y).toBeGreaterThan(0);
    expect(fast.duration).toBeLessThan(slow.duration);
    expect(fast.duration).toBeGreaterThanOrEqual(0.2);
  });

  it("keeps the grabbed local point fixed through lift and tilt", () => {
    for (const angle of [-6, 0, 6]) {
      const anchor = { x: 240, y: 13 };
      const offset = turnAnchorOffset(anchor.x, anchor.y, 1.02, angle);
      const radians = angle * Math.PI / 180;
      expect(offset.x + 1.02 * (anchor.x * Math.cos(radians) - anchor.y * Math.sin(radians))).toBeCloseTo(anchor.x);
      expect(offset.y + 1.02 * (anchor.x * Math.sin(radians) + anchor.y * Math.cos(radians))).toBeCloseTo(anchor.y);
    }
  });

  it("cancellation never clicks or discards, even beyond the threshold", () => {
    const g = new SeedWorldTurnGesture();
    g.begin(1, 0, 0);
    g.move(1, 200, 100);
    expect(g.finish(1, true)).toBe("return");
    g.begin(1, 0, 0);
    g.cancel();
    expect(g.finish(1)).toBeUndefined();
  });
});


describe("glass bar drag intent", () => {
  it("keeps small motion as a click and reserves vertical body drags for reading", () => {
    expect(turnDragIntent(true, 2, 3)).toBeUndefined();
    expect(turnDragIntent(true, 4, 30)).toBe("scroll");
    expect(turnDragIntent(true, 40, 4)).toBe("throw");
    expect(turnDragIntent(false, 4, 30)).toBe("throw");
    expect(turnDragIntent(false, -40, -15)).toBe("throw");
  });
});


it("real Session stops preparing photos, restores the HUD on remount, and keeps viewer/trace ownership outside the HUD", async () => {
  const request = vi.mocked(requestAsapChat);
  request.mockReset(); request.mockResolvedValue({ content: "完成", toolCalls: [], finishReason: "stop" });
  const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: {
    toolNames: [], scriptApi: { catalog: "none", entries: [], modules: [] }
  } }) });
  const f = await createControllerFixture(session);
  await f.controller.submit("previous task");
  const gate = Promise.withResolvers<any[]>();
  const release = vi.fn();
  Object.assign(f.application, { viewSnapshots: { acquireAttachments: () => ({ export: () => gate.promise, release }) } });
  const pending = f.controller.submit("new photo");
  expect(session.state).toBe("preparing"); expect(f.controller.busy).toBe(true);
  expect(f.view.layout.setTranscript).toHaveBeenLastCalledWith("正在准备图片和输入…");
  await f.controller.stop();
  expect(session.state).toBe("stopped"); expect(f.controller.busy).toBe(false);
  expect(f.view.layout.setTranscript).toHaveBeenLastCalledWith("任务已停止。");
  expect(f.view.controlIcon.sprite).toBe(f.view.resources.retrySprite);
  f.controller.destroy();
  expect(session.state).toBe("stopped"); expect(release).not.toHaveBeenCalled();
  const restored = await createControllerFixture(session, f.activity);
  expect(restored.view.layout.setTranscript).toHaveBeenLastCalledWith("任务已停止。");
  const continued = restored.controller.continue();
  expect(session.state).toBe("preparing");
  gate.resolve([]); await continued; await pending;
  expect(release).toHaveBeenCalledOnce(); expect(request).toHaveBeenCalledTimes(2);
  expect(restored.view.layout.setTranscript).toHaveBeenLastCalledWith("完成");
  expect(session.snapshot.current?.outcome).toMatchObject({ status: "completed", message: "完成" });
  expect(f.traceStore.getLastTrace()?.status).toBe("completed");
  restored.controller.destroy(); session.dispose();
});

  beforeEach(() => {
    const testWindow = new EventTarget() as EventTarget & {
      setTimeout(handler: TimerHandler, timeout?: number): number;
      clearTimeout(handle?: number): void;
    };
    testWindow.setTimeout = (handler, timeout) => setTimeout(handler, timeout) as unknown as number;
    testWindow.clearTimeout = (handle) => clearTimeout(handle);
    const testDocument = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
    testDocument.visibilityState = "visible";
    vi.stubGlobal("window", testWindow);
    vi.stubGlobal("document", testDocument);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

it.each([
  { mode: "attached", failure: true }, { mode: "detached", failure: true },
  { mode: "app-disposed", failure: true }, { mode: "detached", failure: false }
])("projects late outcomes solely from Session and releases photo leases: $mode, failure=$failure", async ({ mode, failure }) => {
  const { Material } = await import("@galacean/engine");
  const { SeedWorldViewSnapshots } = await import("@galacean/engine-world-planning/world/SeedWorldViewSnapshot.ts");
  const frame = {
    width: 2, height: 2,
    image: { texture: {} as any, width: 2, height: 2, dispose: vi.fn(),
      export: async () => ({ width: 2, height: 2, blob: new Blob(["photo"], { type: "image/jpeg" }) }) },
    identities: { identityBits: 14, estimatedPosition: () => undefined, byteLength: 16, read: () => new Uint8Array(4), resolve: () => undefined, dispose: vi.fn() }
  };
  const views = new SeedWorldViewSnapshots(() => frame, () => "scene");
  const shot = await views.capture();
  views.setAttachment(shot.snapshotId, []);
  const request = vi.mocked(requestAsapChat);
  request.mockReset();
  request.mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  const later = Promise.withResolvers<any>();
  request.mockReturnValueOnce(later.promise);
  const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: {
    toolNames: [], scriptApi: { catalog: "none", entries: [], modules: [] }, imageResources: views
  } }) });
  const f = await createControllerFixture(session);
  Object.assign(f.application, { viewSnapshots: views });
  // Actual Material/ShaderData destruction reproduces the old stale-view crash.
  // Only the resource registry and draw surface are stubs; no native GPU is used.
  const material = new Material({ resourceManager: {
    _addReferResource() {}, _deleteReferResource() {}, _deleteAsset() {}, _deleteContentRestorer() {}
  } } as any, { name: "hud-lifecycle" } as any);
  (f.view as any).orbMaterial = material;
  f.view.resources.destroy.mockImplementation(() => material.destroy());
  const first = f.controller.submit("original");
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  await f.controller.stop(); await first;
  views.removeAttachment(shot.snapshotId);
  const result = f.controller.continue().then(() => ({ ok: true }), error => ({ ok: false, error: String(error) }));
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  if (mode === "app-disposed") session.dispose();
  if (mode !== "attached") f.controller.destroy();
  const restored = mode === "detached" ? await createControllerFixture(session, f.activity) : undefined;
  if (failure) later.reject(new Error("HTTP 500"));
  else later.resolve({ content: "done", toolCalls: [], finishReason: "stop" });
  const outcome = await result;
  const userMessage = failure ? "任务未完成：处理过程中遇到了问题。\n本次任务没有保存新的修改。\n本次模型请求未返回可执行结果。" : "done";
  await vi.waitFor(() => expect(session.running).toBe(false));
  if (mode === "attached" && failure) {
    expect(material.destroyed).toBe(false);
    expect(f.view.layout.setTranscript).toHaveBeenLastCalledWith(userMessage);
    const another = await createControllerFixture(session, f.activity);
    expect(another.view.layout.setTranscript).toHaveBeenLastCalledWith(userMessage);
    another.controller.destroy();
  }
  if (mode !== "app-disposed") {
    expect(session.snapshot.current?.outcome).toMatchObject({
      status: failure ? "failed" : "completed", message: userMessage
    });
    if (restored) expect(restored.view.layout.setTranscript).toHaveBeenLastCalledWith(userMessage);
    expect(views.resourceStats.turn).toBe(1);
    expect(views.resourceStats.snapshots[0].leases).toBe(0);
    expect(frame.image.dispose).not.toHaveBeenCalled();
    request.mockResolvedValue({ content: "next", toolCalls: [], finishReason: "stop" });
    const options = { model: request.mock.calls[0][0].model };
    await session.run("next 1", options); await session.run("next 2", options);
    expect(frame.image.dispose).not.toHaveBeenCalled();
    await session.run("next 3", options);
    expect(frame.image.dispose).toHaveBeenCalledOnce();
  }
  restored?.controller.destroy(); f.controller.destroy(); session.dispose(); views.dispose();
  await Promise.resolve();
  expect(material.destroyed).toBe(true);
  expect(views.budget.stats.total).toBe(0);
  expect(frame.identities.dispose).toHaveBeenCalledOnce();
  expect(outcome).toEqual({ ok: true });
});
