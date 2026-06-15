import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioManager, AudioSource } from "@galacean/engine-core";

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
    this.onstatechange?.();
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.state = "suspended";
    this.onstatechange?.();
    return Promise.resolve();
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

describe("AudioSource pending playback", () => {
  beforeEach(() => {
    (window as any).AudioContext = MockAudioContext;
    (AudioManager as any)._context = null;
    (AudioManager as any)._gainNode = null;
    (AudioManager as any)._needsUserGestureResume = false;
    (AudioManager as any)._pendingSources = new Set();
    (AudioManager as any)._hidden = false;
    MockAudioContext.shouldResumeSucceed = true;
    MockAudioContext.resumeResultQueue = null;
    AudioManager._playingCount = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it("suspends context on visibilitychange hidden", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    const suspendSpy = vi.spyOn(context, "suspend");

    context.state = "running";

    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(suspendSpy).toHaveBeenCalledTimes(1);
    expect((AudioManager as any)._hidden).to.be.true;
  });

  it("resumes context on visibilitychange shown via iOS zombie fix", async () => {
    vi.useFakeTimers();
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    context.state = "running";
    const suspendSpy = vi.spyOn(context, "suspend");
    const resumeSpy = vi.spyOn(context, "resume");

    (AudioManager as any)._onHidden();
    expect(suspendSpy).toHaveBeenCalledTimes(1);

    (AudioManager as any)._onShown();
    // _onShown calls context.suspend() synchronously then schedules resume after 100ms
    expect(suspendSpy).toHaveBeenCalledTimes(2);

    vi.runAllTimers();
    await flushAsync();

    expect(resumeSpy).toHaveBeenCalled();
  });

  it("does not act on visibilitychange shown without prior hide", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const suspendSpy = vi.spyOn(context, "suspend");

    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();

    expect(suspendSpy).not.toHaveBeenCalled();
  });

  it("handles pagehide/pageshow lifecycle", async () => {
    vi.useFakeTimers();
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    context.state = "running";

    (AudioManager as any)._onHidden();
    expect((AudioManager as any)._hidden).to.be.true;
    expect(context.state).to.equal("suspended");

    (AudioManager as any)._onShown();
    expect((AudioManager as any)._hidden).to.be.false;

    // iOS zombie fix uses window.setTimeout(100ms)
    vi.runAllTimers();
    await flushAsync();
    await flushAsync();

    expect(context.state).to.equal("running");
  });

  it("sets gesture resume flag when foreground resume fails", async () => {
    vi.useFakeTimers();
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    context.state = "running";

    // Hide
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));

    // Show, but resume will fail
    MockAudioContext.shouldResumeSucceed = false;
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.advanceTimersByTimeAsync(100);
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
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;
    context.state = "running";

    audioSource.play();
    expect(audioSource.isPlaying).to.be.true;

    audioSource.stop();
    expect(audioSource.isPlaying).to.be.false;

    // hide → show cycle
    (AudioManager as any)._onHidden();
    (AudioManager as any)._onShown();
    vi.runAllTimers();
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
});
