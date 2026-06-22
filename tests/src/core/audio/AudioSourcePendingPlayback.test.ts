import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioManager, AudioSource } from "@galacean/engine-core/src/audio";

const originalAudioContext = window.AudioContext;

class MockGainNode {
  gain = {
    setValueAtTime: vi.fn()
  };

  connect = vi.fn();
}

class MockBufferSourceNode {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  playbackRate = {
    value: 1
  };

  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockAudioContext {
  static shouldResumeSucceed = true;
  static shouldSuspendSucceed = true;
  static resumeResultQueue: Array<Promise<void> | Error> | null = null;

  currentTime = 0;
  destination = {};
  state: AudioContextState = "suspended";

  createBufferSource(): AudioBufferSourceNode {
    return new MockBufferSourceNode() as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    return new MockGainNode() as unknown as GainNode;
  }

  resume(): Promise<void> {
    const queuedResult = MockAudioContext.resumeResultQueue?.shift();
    if (queuedResult instanceof Promise) {
      return queuedResult.then(() => {
        this.state = "running";
      });
    }
    if (queuedResult instanceof Error) {
      return Promise.reject(queuedResult);
    }
    if (!MockAudioContext.shouldResumeSucceed) {
      return Promise.reject(new Error("autoplay blocked"));
    }
    this.state = "running";
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    if (!MockAudioContext.shouldSuspendSucceed) {
      return Promise.reject(new Error("suspend blocked"));
    }
    this.state = "suspended";
    return Promise.resolve();
  }
}

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
  }
}

function createAudioSource(): AudioSource {
  const audioSource = new AudioSource({
    _isActiveInHierarchy: true,
    _isActiveInScene: true,
    _removeComponent() {},
    engine: {}
  } as any);

  audioSource.clip = {
    _addReferCount() {},
    _getAudioSource() {
      return { duration: 10 };
    }
  } as any;

  return audioSource;
}

function resetAudioManagerState(): void {
  document.removeEventListener("visibilitychange", (AudioManager as any)._onVisibilityChange);
  window.removeEventListener("pageshow", (AudioManager as any)._onPageShow);
  document.removeEventListener("touchstart", (AudioManager as any)._resumeAfterInterruption);
  document.removeEventListener("touchend", (AudioManager as any)._resumeAfterInterruption);
  document.removeEventListener("click", (AudioManager as any)._resumeAfterInterruption);

  (AudioManager as any)._context = null;
  (AudioManager as any)._gainNode = null;
  (AudioManager as any)._resumePromise = null;
  (AudioManager as any)._needsUserGestureResume = false;
  (AudioManager as any)._suspendedByCaller = false;
  (AudioManager as any)._recovering = false;
  (AudioManager as any)._playingCount = 0;
}

function captureScheduledTimers(): Array<() => void> {
  const scheduledTimers: Array<() => void> = [];
  vi.spyOn(globalThis, "setTimeout").mockImplementation((handler: TimerHandler) => {
    scheduledTimers.push(handler as () => void);
    return scheduledTimers.length as any;
  });
  return scheduledTimers;
}

function mockDocumentHidden(initialHidden: boolean): { set(hidden: boolean): void; restore(): void } {
  const ownDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
  let hidden = initialHidden;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden
  });
  return {
    set(value: boolean) {
      hidden = value;
    },
    restore() {
      if (ownDescriptor) {
        Object.defineProperty(document, "hidden", ownDescriptor);
      } else {
        delete (document as any).hidden;
      }
    }
  };
}

describe("AudioSource playback lifecycle", () => {
  beforeEach(() => {
    resetAudioManagerState();
    (window as any).AudioContext = MockAudioContext;
    MockAudioContext.shouldResumeSucceed = true;
    MockAudioContext.shouldSuspendSucceed = true;
    MockAudioContext.resumeResultQueue = null;
  });

  afterEach(async () => {
    await flushAsync();
    resetAudioManagerState();
    (window as any).AudioContext = originalAudioContext;
    vi.useRealTimers();
    vi.restoreAllMocks();
    await flushAsync();
  });

  it("defers AudioContext creation until first play", () => {
    const audioSource = createAudioSource();

    // setting clip must not have created the context
    expect((AudioManager as any)._context == null).to.be.true;

    const context = new MockAudioContext();
    context.state = "running";
    (AudioManager as any)._context = context;

    audioSource.play();

    expect((AudioManager as any)._context != null).to.be.true;
  });

  it("applies a pre-play volume lazily on first play", () => {
    const audioSource = createAudioSource();

    audioSource.volume = 0.3;

    // no node and no context created by the volume setter alone
    expect((audioSource as any)._gainNode == null).to.be.true;
    expect((AudioManager as any)._context == null).to.be.true;
    expect(audioSource.volume).to.equal(0.3);

    const context = new MockAudioContext();
    context.state = "running";
    (AudioManager as any)._context = context;

    audioSource.play();

    const gainNode = (audioSource as any)._gainNode as MockGainNode;
    expect(gainNode != null).to.be.true;
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.3, context.currentTime);
  });

  it("starts immediately when the context is already running", () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    const before = (AudioManager as any)._playingCount;
    audioSource.play();

    expect(audioSource.isPlaying).to.be.true;
    expect((AudioManager as any)._playingCount).to.equal(before + 1);
  });

  it("guards play re-entrancy", () => {
    // (a) no clip -> noop
    const noClip = new AudioSource({
      _isActiveInHierarchy: true,
      _isActiveInScene: true,
      _removeComponent() {},
      engine: {}
    } as any);
    noClip.play();
    expect(noClip.isPlaying).to.be.false;
    expect((AudioManager as any)._context == null).to.be.true;

    // (b) already playing -> second play is a noop
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";
    const resumeSpy = vi.spyOn(context, "resume");

    audioSource.play();
    expect(audioSource.isPlaying).to.be.true;
    const count = (AudioManager as any)._playingCount;

    audioSource.play();
    expect((AudioManager as any)._playingCount).to.equal(count);
    expect(resumeSpy).not.toHaveBeenCalled();

    // (c) pending play -> noop
    audioSource.stop();
    context.state = "suspended";
    (audioSource as any)._pendingPlay = true;
    audioSource.play();
    expect(audioSource.isPlaying).to.be.false;
  });

  // KEY divergence: hidden play is dropped, never suspends
  it("drops a play requested while hidden without pending or suspending", async () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";
    const ctxSuspendSpy = vi.spyOn(context, "suspend");
    const managerSuspendSpy = vi.spyOn(AudioManager, "suspend");

    const documentHidden = mockDocumentHidden(true);
    audioSource.play();
    documentHidden.restore();
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;
    expect((audioSource as any)._pendingPlay).to.be.false;
    expect(ctxSuspendSpy).not.toHaveBeenCalled();
    expect(managerSuspendSpy).not.toHaveBeenCalled();
  });

  it("does not replay a hidden-dropped play after returning to foreground", () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    const documentHidden = mockDocumentHidden(true);
    audioSource.play();
    expect(audioSource.isPlaying).to.be.false;
    expect((audioSource as any)._pendingPlay).to.be.false;

    documentHidden.set(false);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    vi.advanceTimersByTime(100);
    documentHidden.restore();

    expect(audioSource.isPlaying).to.be.false;
    expect((audioSource as any)._pendingPlay).to.be.false;
  });

  it("replays the pending play on the resume it triggered", async () => {
    const audioSource = createAudioSource();
    const documentHidden = mockDocumentHidden(false);
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";

    audioSource.play();
    expect((audioSource as any)._pendingPlay).to.be.true;

    await flushAsync();
    documentHidden.restore();

    expect((audioSource as any)._pendingPlay).to.be.false;
    expect(audioSource.isPlaying).to.be.true;
  });

  // HEADLINE
  it("drops playback after autoplay-blocked resume instead of replaying on a later gesture", async () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";

    vi.spyOn(console, "warn").mockImplementation(() => {});
    MockAudioContext.shouldResumeSucceed = false;

    audioSource.play();
    await flushAsync();

    expect((audioSource as any)._pendingPlay).to.be.false;
    expect(audioSource.isPlaying).to.be.false;

    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;
  });

  it("cancels a one-shot pending play before resume resolves", async () => {
    const audioSource = createAudioSource();
    const documentHidden = mockDocumentHidden(false);
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";

    let resolveResume: () => void;
    MockAudioContext.resumeResultQueue = [
      new Promise<void>((resolve) => {
        resolveResume = resolve;
      })
    ];

    audioSource.play();
    expect((audioSource as any)._pendingPlay).to.be.true;

    audioSource.stop();
    expect((audioSource as any)._pendingPlay).to.be.false;

    resolveResume!();
    await flushAsync();
    documentHidden.restore();

    expect(audioSource.isPlaying).to.be.false;
  });

  it("drops playback after explicit suspend when resume is autoplay-blocked", async () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    await AudioManager.suspend();
    await flushAsync();

    MockAudioContext.shouldResumeSucceed = false;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    audioSource.play();
    await flushAsync();

    expect((audioSource as any)._pendingPlay).to.be.false;
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;

    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;
  });

  it("resume() unlocks a suspended context and clears the gesture flag", async () => {
    createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";
    (AudioManager as any)._needsUserGestureResume = true;

    await AudioManager.resume();

    expect(context.state).to.equal("running");
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
  });

  it("coalesces overlapping resume() calls and re-issues a later resume", async () => {
    createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";

    let resolveFirst: () => void;
    MockAudioContext.resumeResultQueue = [
      new Promise<void>((resolve) => {
        resolveFirst = resolve;
      })
    ];
    const resumeSpy = vi.spyOn(context, "resume");

    AudioManager.resume().catch(() => {});
    AudioManager.resume().catch(() => {});
    expect(resumeSpy).toHaveBeenCalledTimes(1);

    resolveFirst!();
    await flushAsync();

    await AudioManager.resume();
    expect(resumeSpy).toHaveBeenCalledTimes(2);
  });

  it("does not auto-resume a caller-controlled suspend on a later gesture", async () => {
    createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";
    const resumeSpy = vi.spyOn(context, "resume");

    await AudioManager.suspend();
    await flushAsync();

    document.dispatchEvent(new Event("click"));
    document.dispatchEvent(new Event("touchend"));
    await flushAsync();

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(context.state).to.equal("suspended");
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
  });

  it("keeps a playing source playing across a hide without tearing down the node", async () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    expect(audioSource.isPlaying).to.be.true;
    const count = (AudioManager as any)._playingCount;

    const documentHidden = mockDocumentHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    documentHidden.restore();
    await flushAsync();

    expect(audioSource.isPlaying).to.be.true;
    expect((AudioManager as any)._playingCount).to.equal(count);
  });

  it("performs the foreground zombie reset: suspend, 100ms, resume", async () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    expect((AudioManager as any)._playingCount > 0).to.be.true;

    // simulate iOS leaving the context non-running after the interruption
    context.state = "suspended";
    const suspendSpy = vi.spyOn(context, "suspend");
    const resumeSpy = vi.spyOn(context, "resume");

    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(suspendSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    await flushAsync();
    documentHidden.restore();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect((AudioManager as any)._recovering).to.be.false;
    expect(context.state).to.equal("running");
  });

  it("runs a single recovery cycle for back-to-back visibilitychange and pageshow", () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    context.state = "suspended";

    const scheduledTimers = captureScheduledTimers();
    const suspendSpy = vi.spyOn(context, "suspend");

    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    documentHidden.restore();

    // _recovering guards the 2nd dispatch between the synchronous events
    expect(suspendSpy).toHaveBeenCalledTimes(1);
    expect(scheduledTimers).to.have.lengthOf(1);
  });

  it("skips recovery when nothing is playing", () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    audioSource.stop();
    expect((AudioManager as any)._playingCount).to.equal(0);

    context.state = "suspended";
    const suspendSpy = vi.spyOn(context, "suspend");
    const resumeSpy = vi.spyOn(context, "resume");

    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    vi.advanceTimersByTime(100);
    documentHidden.restore();

    expect(suspendSpy).not.toHaveBeenCalled();
    expect(resumeSpy).not.toHaveBeenCalled();
  });

  it("skips recovery after a caller suspend across a hide/show", async () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    await AudioManager.suspend();

    const resumeSpy = vi.spyOn(context, "resume");

    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    vi.advanceTimersByTime(100);
    documentHidden.restore();

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(context.state).to.equal("suspended");
  });

  it("falls back to a gesture when the foreground resume fails, then a click resumes", async () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    context.state = "suspended";

    // the timer's auto-resume rejects, leaving the gesture fallback armed
    MockAudioContext.resumeResultQueue = [new Error("autoplay blocked")];
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(100);
    await flushAsync();

    expect((AudioManager as any)._needsUserGestureResume).to.be.true;
    expect(context.state).to.equal("suspended");

    vi.useRealTimers();
    MockAudioContext.resumeResultQueue = null;
    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("click"));
    await flushAsync();
    documentHidden.restore();

    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
    expect(context.state).to.equal("running");
  });

  it("still resumes when the zombie-reset suspend rejects", async () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    context.state = "suspended";

    MockAudioContext.shouldSuspendSucceed = false;
    const resumeSpy = vi.spyOn(context, "resume");

    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(100);
    await flushAsync();
    documentHidden.restore();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(context.state).to.equal("running");
    expect((AudioManager as any)._recovering).to.be.false;
  });

  it("treats a non-persisted pageshow as a no-op", () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    context.state = "suspended";

    const scheduledTimers = captureScheduledTimers();
    const suspendSpy = vi.spyOn(context, "suspend");

    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));

    expect(suspendSpy).not.toHaveBeenCalled();
    expect(scheduledTimers).to.have.lengthOf(0);
  });

  it("does nothing on a spurious visibilitychange-shown with a running context", async () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();

    const suspendSpy = vi.spyOn(context, "suspend");
    const resumeSpy = vi.spyOn(context, "resume");

    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    documentHidden.restore();
    await flushAsync();

    expect(suspendSpy).not.toHaveBeenCalled();
    expect(resumeSpy).not.toHaveBeenCalled();
  });

  it("keeps stop()/pause() bookkeeping consistent", () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";
    context.currentTime = 5;

    audioSource.play();
    const playingCount = (AudioManager as any)._playingCount;

    audioSource.pause();
    expect((AudioManager as any)._playingCount).to.equal(playingCount - 1);
    expect(audioSource.isPlaying).to.be.false;
    expect((audioSource as any)._pausedTime > 0).to.be.true;

    audioSource.play();
    const playingCount2 = (AudioManager as any)._playingCount;

    audioSource.stop();
    expect((audioSource as any)._pausedTime).to.equal(-1);
    expect((audioSource as any)._playTime).to.equal(-1);
    expect((AudioManager as any)._playingCount).to.equal(playingCount2 - 1);
    expect((audioSource as any)._pendingPlay).to.be.false;
  });

  // suspend() must not create a context just to suspend it (would be the cold-ctx iOS zombie we avoid)
  it("does not create a context when suspend() is called before any playback", async () => {
    await AudioManager.suspend();

    expect((AudioManager as any)._context == null).to.be.true;
    expect((AudioManager as any)._suspendedByCaller).to.be.true;
  });

  // hide-suspend: desktop/Android don't auto-suspend WebAudio when backgrounded, so we suspend on hide
  it("suspends the context when the page is hidden", () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";
    audioSource.play();
    const suspendSpy = vi.spyOn(context, "suspend");

    const documentHidden = mockDocumentHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    documentHidden.restore();

    expect(suspendSpy).toHaveBeenCalledTimes(1);
  });

  // hide-suspend must not create a context (would break the deferred-creation root-cause fix)
  it("does not create a context on hide when none exists", () => {
    document.removeEventListener("visibilitychange", (AudioManager as any)._onVisibilityChange);
    document.addEventListener("visibilitychange", (AudioManager as any)._onVisibilityChange);

    const documentHidden = mockDocumentHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    documentHidden.restore();

    expect((AudioManager as any)._context == null).to.be.true;
  });

  // hide-suspend uses the bare context.suspend(), so a return to foreground still recovers
  it("recovers after a hide-suspend (hide does not flag _suspendedByCaller)", async () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";
    audioSource.play();

    const documentHidden = mockDocumentHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect((AudioManager as any)._suspendedByCaller).to.be.false;

    const resumeSpy = vi.spyOn(context, "resume");
    documentHidden.set(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(100);
    await flushAsync();
    documentHidden.restore();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(context.state).to.equal("running");
  });

  // staleness guard: hidden again during the 100ms recovery delay must not resume on a backgrounded page
  it("does not resume if hidden again during the recovery delay", async () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";
    audioSource.play();
    context.state = "suspended";

    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    const resumeSpy = vi.spyOn(context, "resume");

    // hidden again before the 100ms timer fires
    documentHidden.set(true);
    vi.advanceTimersByTime(100);
    await flushAsync();
    documentHidden.restore();

    expect(resumeSpy).not.toHaveBeenCalled();
  });
});
