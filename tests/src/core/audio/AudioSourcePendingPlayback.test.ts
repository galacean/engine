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
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
    MockAudioContext.shouldResumeSucceed = true;
    MockAudioContext.resumeResultQueue = null;
    AudioManager._playingCount = 0;
  });

  afterEach(() => {
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

  it("resumes automatically when returning to the foreground with active audio", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const resumeSpy = vi.spyOn(context, "resume");
    const suspendSpy = vi.spyOn(AudioManager, "suspend");

    context.state = "suspended";
    AudioManager._playingCount = 1;

    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(suspendSpy).not.toHaveBeenCalled();
    expect(context.state).to.equal("running");
    expect((AudioManager as any)._needsUserGestureResume).to.be.false;
  });

  it("recreates active source nodes after a background interruption", async () => {
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

    expect(audioSource.isPlaying).to.be.true;
    expect(AudioManager._playingCount).to.equal(1);
    expect((AudioManager as any)._interruptedSources.size).to.equal(0);
    expect((audioSource as any)._sourceNode).not.to.equal(firstSourceNode);
  });

  it("falls back to gesture recovery when foreground auto-resume fails", async () => {
    createAudioSource();
    const context = (AudioManager as any)._context as MockAudioContext;

    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const resumeSpy = vi.spyOn(context, "resume");
    const suspendSpy = vi.spyOn(AudioManager, "suspend");

    MockAudioContext.shouldResumeSucceed = false;
    context.state = "suspended";
    AudioManager._playingCount = 1;

    document.dispatchEvent(new Event("visibilitychange"));
    await flushAsync();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(suspendSpy).toHaveBeenCalledTimes(1);
    expect((AudioManager as any)._needsUserGestureResume).to.be.true;

    MockAudioContext.shouldResumeSucceed = true;
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(resumeSpy).toHaveBeenCalledTimes(2);
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
