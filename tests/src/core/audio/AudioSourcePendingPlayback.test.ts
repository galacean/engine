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
      return {};
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
    (AudioManager as any)._playingSources = new Set();
    (AudioManager as any)._interruptedSources = new Set();
    (AudioManager as any)._foregroundRestoreTimer = undefined;
    (AudioManager as any)._hidden = false;
    MockAudioContext.shouldResumeSucceed = true;
    MockAudioContext.resumeResultQueue = null;
    AudioManager._playingCount = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.replaceChildren();
  });

  it("replays pending playback on the next user gesture after autoplay blocking", async () => {
    const audioSource = createAudioSource();

    vi.spyOn(console, "warn").mockImplementation(() => {});
    MockAudioContext.shouldResumeSucceed = false;

    audioSource.play();
    await flushAsync();

    expect((audioSource as any)._pendingPlay).to.be.true;
    expect((AudioManager as any)._pendingSources.size).to.equal(1);
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
    expect(audioSource.isPlaying).to.be.false;

    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.true;
    expect((audioSource as any)._pendingPlay).to.be.false;
    expect((AudioManager as any)._pendingSources.size).to.equal(0);
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
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
    expect((audioSource as any)._pendingPlay).to.be.false;
  });

  it("keeps resume a no-op until a context already exists", async () => {
    expect((AudioManager as any)._context).to.be.null;

    await AudioManager.resume();

    expect((AudioManager as any)._context).to.be.null;
  });

  it("does not resume foreground audio before a hide event", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const resumeSpy = vi.spyOn(context, "resume");
    const suspendSpy = vi.spyOn(AudioManager, "suspend");

    context.state = "suspended";
    AudioManager._playingCount = 1;

    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(suspendSpy).not.toHaveBeenCalled();
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
  });

  it("recreates interrupted source nodes from a foreground gesture", async () => {
    const audioSource = createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    context.state = "running";
    audioSource.play();

    const firstSourceNode = (audioSource as any)._sourceNode as MockBufferSourceNode;
    expect(audioSource.isPlaying).to.be.true;
    expect(AudioManager._playingCount).to.equal(1);

    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();

    expect(firstSourceNode.stop).toHaveBeenCalledTimes(1);
    expect(audioSource.isPlaying).to.be.false;
    expect(AudioManager._playingCount).to.equal(0);
    expect((AudioManager as any)._interruptedSources.size).to.equal(1);

    hiddenSpy.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;
    expect((AudioManager as any)._interruptedSources.size).to.equal(1);
    expect((AudioManager as any)._needsUserGestureResume).to.be.true;

    document.dispatchEvent(new Event("touchend"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.true;
    expect(AudioManager._playingCount).to.equal(1);
    expect((AudioManager as any)._interruptedSources.size).to.equal(0);
    expect((audioSource as any)._sourceNode).not.to.equal(firstSourceNode);
  });

  it("recovers interrupted source nodes from foreground retry after the restore delay", async () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    context.state = "running";
    audioSource.play();

    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();

    hiddenSpy.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;

    await vi.advanceTimersByTimeAsync(299);
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;

    await vi.advanceTimersByTimeAsync(1);
    await flushAsync();

    expect(audioSource.isPlaying).to.be.true;
    expect((AudioManager as any)._interruptedSources.size).to.equal(0);
  });

  it("handles document pagehide/pageshow and mouseup recovery", async () => {
    const audioSource = createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    context.state = "running";
    audioSource.play();

    document.dispatchEvent(new Event("pagehide"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;
    expect((AudioManager as any)._interruptedSources.size).to.equal(1);

    document.dispatchEvent(new Event("pageshow"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;
    expect((AudioManager as any)._needsUserGestureResume).to.be.true;

    document.dispatchEvent(new Event("mouseup"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.true;
    expect((AudioManager as any)._interruptedSources.size).to.equal(0);
  });

  it("keeps gesture recovery when foreground resume fails", async () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const resumeSpy = vi.spyOn(context, "resume");
    const suspendSpy = vi.spyOn(AudioManager, "suspend");

    context.state = "running";
    audioSource.play();

    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();

    MockAudioContext.shouldResumeSucceed = false;
    hiddenSpy.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(suspendSpy).toHaveBeenCalledTimes(2);
    expect((AudioManager as any)._needsUserGestureResume).to.be.true;

    await vi.advanceTimersByTimeAsync(299);
    await flushAsync();

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(suspendSpy).toHaveBeenCalledTimes(2);
    expect((AudioManager as any)._needsUserGestureResume).to.be.true;

    await vi.advanceTimersByTimeAsync(1);
    await flushAsync();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(suspendSpy).toHaveBeenCalledTimes(3);
    expect((AudioManager as any)._needsUserGestureResume).to.be.true;

    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(resumeSpy).toHaveBeenCalledTimes(2);
    expect((AudioManager as any)._needsUserGestureResume).to.be.true;

    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(resumeSpy).toHaveBeenCalledTimes(3);
    expect(context.state).to.equal("running");
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
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
});
