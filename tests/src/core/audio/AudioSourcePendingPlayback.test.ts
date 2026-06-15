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
  static resumeResultQueue: Array<Promise<void> | Error> | null = null;

  currentTime = 0;
  destination = {};
  onstatechange: (() => void) | null = null;
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
      return queuedResult;
    }
    if (queuedResult instanceof Error) {
      return Promise.reject(queuedResult);
    }
    if (!MockAudioContext.shouldResumeSucceed) {
      return Promise.reject(new Error("autoplay blocked"));
    }
    this.state = "running";
    const cb = this.onstatechange;
    return Promise.resolve().then(() => {
      cb?.();
    });
  }

  suspend(): Promise<void> {
    this.state = "suspended";
    const cb = this.onstatechange;
    return Promise.resolve().then(() => {
      cb?.();
    });
  }
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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
  window.removeEventListener("pagehide", (AudioManager as any)._onHidden);
  window.removeEventListener("pageshow", (AudioManager as any)._onShown);
  document.removeEventListener("pointerup", (AudioManager as any)._resumeAfterInterruption);
  document.removeEventListener("click", (AudioManager as any)._resumeAfterInterruption);

  const foregroundResumeTimer = (AudioManager as any)._foregroundResumeTimer;
  if (foregroundResumeTimer !== null && foregroundResumeTimer !== undefined) {
    clearTimeout(foregroundResumeTimer);
  }

  (AudioManager as any)._context = null;
  (AudioManager as any)._gainNode = null;
  (AudioManager as any)._needsUserGestureResume = false;
  (AudioManager as any)._pendingSources = new Set();
  (AudioManager as any)._hidden = false;
  (AudioManager as any)._foregroundResumeTimer = null;
  (AudioManager as any)._suspendedByCaller = false;
  AudioManager._playingCount = 0;
}

function captureScheduledTimers(): Array<() => void> {
  const scheduledTimers: Array<() => void> = [];
  vi.spyOn(globalThis, "setTimeout").mockImplementation((handler: TimerHandler) => {
    scheduledTimers.push(handler as () => void);
    return scheduledTimers.length as any;
  });
  return scheduledTimers;
}

describe("AudioSource pending playback", () => {
  beforeEach(() => {
    resetAudioManagerState();
    (window as any).AudioContext = MockAudioContext;
    MockAudioContext.shouldResumeSucceed = true;
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

  it("replays pending playback on the next user gesture after autoplay blocking", async () => {
    const audioSource = createAudioSource();

    vi.spyOn(console, "warn").mockImplementation(() => {});
    MockAudioContext.shouldResumeSucceed = false;

    audioSource.play();
    await flushAsync();

    expect((audioSource as any)._pendingPlay).to.be.true;
    expect((AudioManager as any)._pendingSources.size).to.equal(1);
    expect(audioSource.isPlaying).to.be.false;

    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.true;
    expect((audioSource as any)._pendingPlay).to.be.false;
    expect((AudioManager as any)._pendingSources.size).to.equal(0);
  });

  it("cancels pending playback before the unlocking gesture arrives", async () => {
    const audioSource = createAudioSource();

    vi.spyOn(console, "warn").mockImplementation(() => {});
    MockAudioContext.shouldResumeSucceed = false;

    audioSource.play();
    await flushAsync();

    audioSource.stop();
    expect((audioSource as any)._pendingPlay).to.be.false;
    expect((AudioManager as any)._pendingSources.size).to.equal(0);

    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;
  });

  it("resume() unlocks a suspended context", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    expect(context.state).to.equal("suspended");

    await AudioManager.resume();

    expect(context.state).to.equal("running");
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
  });

  it("suspends context when hidden", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    const suspendSpy = vi.spyOn(context, "suspend");

    context.state = "running";

    (AudioManager as any)._onHidden();
    await flushAsync();

    expect(suspendSpy).toHaveBeenCalledTimes(1);
    expect((AudioManager as any)._hidden).to.be.true;
  });

  it("resumes context on visibilitychange shown via iOS zombie fix", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    const scheduledTimers = captureScheduledTimers();

    context.state = "running";
    const suspendSpy = vi.spyOn(context, "suspend");
    const resumeSpy = vi.spyOn(context, "resume");

    (AudioManager as any)._onHidden();
    expect(suspendSpy).toHaveBeenCalledTimes(1);

    (AudioManager as any)._onShown();
    // _onShown calls context.suspend() synchronously then schedules resume after 100ms
    expect(suspendSpy).toHaveBeenCalledTimes(2);
    expect(scheduledTimers).to.have.lengthOf(1);

    scheduledTimers[0]();
    await flushAsync();

    expect(resumeSpy).toHaveBeenCalled();
  });

  it("does not run the delayed foreground resume after hiding again", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    const scheduledTimers = captureScheduledTimers();

    context.state = "running";
    const resumeSpy = vi.spyOn(context, "resume");

    (AudioManager as any)._onHidden();
    (AudioManager as any)._onShown();
    expect(scheduledTimers).to.have.lengthOf(1);

    (AudioManager as any)._onHidden();

    scheduledTimers[0]();
    await flushAsync();

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(context.state).to.equal("suspended");
  });

  it("does not resume the context while hidden", async () => {
    const audioSource = createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    const resumeSpy = vi.spyOn(context, "resume");

    context.state = "running";
    audioSource.play();
    expect(audioSource.isPlaying).to.be.true;

    (AudioManager as any)._onHidden();
    await flushAsync();

    await AudioManager.resume();
    await flushAsync();

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(context.state).to.equal("suspended");
    expect(audioSource.isPlaying).to.be.true;
  });

  it("does not auto-resume a caller-controlled suspend on the next gesture", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    const resumeSpy = vi.spyOn(context, "resume");

    context.state = "running";
    await AudioManager.suspend();
    (AudioManager as any)._onContextStateChange();
    await flushAsync();

    expect((AudioManager as any)._needsUserGestureResume).to.be.false;

    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(context.state).to.equal("suspended");
  });

  it("keeps pending playback retryable when play after explicit suspend is autoplay-blocked", async () => {
    const audioSource = createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    context.state = "running";
    await AudioManager.suspend();
    await flushAsync();

    MockAudioContext.shouldResumeSucceed = false;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    audioSource.play();
    await flushAsync();

    expect((audioSource as any)._pendingPlay).to.be.true;
    expect((AudioManager as any)._pendingSources.size).to.equal(1);
    expect((AudioManager as any)._needsUserGestureResume).to.be.true;

    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.true;
    expect((audioSource as any)._pendingPlay).to.be.false;
    expect((AudioManager as any)._pendingSources.size).to.equal(0);
  });

  it("does not act on visibilitychange shown without prior hide", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    const suspendSpy = vi.spyOn(context, "suspend");

    (AudioManager as any)._onShown();
    await flushAsync();

    expect(suspendSpy).not.toHaveBeenCalled();
  });

  it("handles pagehide/pageshow lifecycle", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    const scheduledTimers = captureScheduledTimers();
    context.state = "running";

    (AudioManager as any)._onHidden();
    expect((AudioManager as any)._hidden).to.be.true;
    expect(context.state).to.equal("suspended");

    (AudioManager as any)._onShown();
    expect((AudioManager as any)._hidden).to.be.false;
    expect(scheduledTimers).to.have.lengthOf(1);

    // iOS zombie fix uses window.setTimeout(100ms)
    scheduledTimers[0]();
    await flushAsync();
    await flushAsync();

    expect(context.state).to.equal("running");
  });

  it("sets gesture resume flag when foreground resume fails", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    const scheduledTimers = captureScheduledTimers();
    context.state = "running";

    (AudioManager as any)._onHidden();

    // Show, but resume will fail
    MockAudioContext.shouldResumeSucceed = false;
    (AudioManager as any)._onShown();
    expect(scheduledTimers).to.have.lengthOf(1);

    scheduledTimers[0]();
    await flushAsync();

    expect((AudioManager as any)._needsUserGestureResume).to.be.true;

    // Gesture succeeds
    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
    expect(context.state).to.equal("running");
  });

  it("retries context.resume inside a later user gesture even if an earlier resume is still pending", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    const firstResume = new Promise<void>(() => {});

    MockAudioContext.resumeResultQueue = [firstResume];
    const resumeSpy = vi.spyOn(context, "resume");

    AudioManager.resume().catch(() => {});
    await flushAsync();

    expect(resumeSpy).toHaveBeenCalledTimes(1);

    MockAudioContext.resumeResultQueue = [
      Promise.resolve().then(() => {
        context.state = "running";
        context.onstatechange?.();
      })
    ];
    (AudioManager as any)._needsUserGestureResume = true;

    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(resumeSpy).toHaveBeenCalledTimes(2);
    expect(context.state).to.equal("running");
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
  });

  it("keeps _playingCount balanced across play/stop/pause/ended", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    context.state = "running";

    const s1 = createAudioSource();
    const s2 = createAudioSource();

    s1.play();
    s2.play();
    expect(AudioManager._playingCount).to.equal(2);

    s1.pause();
    expect(AudioManager._playingCount).to.equal(1);

    s1.play();
    expect(AudioManager._playingCount).to.equal(2);

    s2.stop();
    expect(AudioManager._playingCount).to.equal(1);

    // Simulate onended
    (s1 as any)._onPlayEnd();
    expect(AudioManager._playingCount).to.equal(0);
  });

  it("does not resume a stopped source after hide/show cycle", async () => {
    const audioSource = createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    const scheduledTimers = captureScheduledTimers();
    context.state = "running";

    audioSource.play();
    expect(audioSource.isPlaying).to.be.true;

    audioSource.stop();
    expect(audioSource.isPlaying).to.be.false;

    // hide → show cycle
    (AudioManager as any)._onHidden();
    (AudioManager as any)._onShown();
    expect(scheduledTimers).to.have.lengthOf(1);
    scheduledTimers[0]();
    await flushAsync();

    // Source stays stopped — context resume does not restart stopped sources
    expect(audioSource.isPlaying).to.be.false;
    expect(AudioManager._playingCount).to.equal(0);
  });

  it("recovers via gesture when _needsUserGestureResume is set (external interruption path)", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    context.state = "suspended";

    // Simulate the state that _onContextStateChange would set on external interruption
    (AudioManager as any)._needsUserGestureResume = true;

    // Gesture triggers resume
    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("pointerup"));
    await flushAsync();

    expect(context.state).to.equal("running");
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
  });

  it("marks external context interruption as gesture-retryable", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    context.state = "suspended";
    context.onstatechange?.();
    await flushAsync();

    expect((AudioManager as any)._needsUserGestureResume).to.be.true;

    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("pointerup"));
    await flushAsync();

    expect(context.state).to.equal("running");
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
  });
});
