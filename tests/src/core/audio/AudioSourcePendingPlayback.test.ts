import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioManager, AudioSource } from "@galacean/engine-core/src/audio";

const originalAudioContext = window.AudioContext;
let restoreUserActivation: (() => void) | null = null;

function mockUserActivation(initialActive: boolean | undefined): { set(active: boolean): void } {
  restoreUserActivation?.();
  const ownDescriptor = Object.getOwnPropertyDescriptor(navigator, "userActivation");
  let active = initialActive;
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    get: () => (active === undefined ? undefined : { hasBeenActive: active, isActive: active })
  });
  restoreUserActivation = () => {
    if (ownDescriptor) {
      Object.defineProperty(navigator, "userActivation", ownDescriptor);
    } else {
      delete (navigator as any).userActivation;
    }
    restoreUserActivation = null;
  };
  return {
    set(value: boolean) {
      active = value;
    }
  };
}

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

function createAudioSource(duration = 10): AudioSource {
  const audioSource = new AudioSource({
    _isActiveInHierarchy: true,
    _isActiveInScene: true,
    _removeComponent() {},
    engine: { resourceManager: { _deleteAsset() {}, _deleteContentRestorer() {} } }
  } as any);

  audioSource.clip = {
    duration,
    _addReferCount() {},
    _getAudioSource() {
      return { duration };
    }
  } as any;

  return audioSource;
}

function resetAudioManagerState(): void {
  document.removeEventListener("visibilitychange", (AudioManager as any)._onVisibilityChange);
  window.removeEventListener("pageshow", (AudioManager as any)._onPageShow);
  document.removeEventListener("touchstart", (AudioManager as any)._onUserGesture, true);
  document.removeEventListener("touchend", (AudioManager as any)._onUserGesture, true);
  document.removeEventListener("click", (AudioManager as any)._onUserGesture, true);

  (AudioManager as any)._context = null;
  (AudioManager as any)._gainNode = null;
  (AudioManager as any)._resumePromise = null;
  (AudioManager as any)._resumeAttemptFromUserGesture = false;
  (AudioManager as any)._interruptionRecoveryPending = false;
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
    mockUserActivation(false);
    (window as any).AudioContext = MockAudioContext;
    MockAudioContext.shouldResumeSucceed = true;
    MockAudioContext.shouldSuspendSucceed = true;
    MockAudioContext.resumeResultQueue = null;
  });

  afterEach(async () => {
    await flushAsync();
    resetAudioManagerState();
    restoreUserActivation?.();
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

  it("does not create an audio context when changing rate before first play", () => {
    const audioSource = createAudioSource();
    const getContextSpy = vi.spyOn(AudioManager, "getContext");
    const nowSpy = vi.spyOn(performance, "now");

    audioSource.playbackRate = 2;

    expect(audioSource.playbackRate).to.equal(2);
    expect(audioSource.time).to.equal(0);
    expect(getContextSpy).not.toHaveBeenCalled();
    expect(nowSpy).not.toHaveBeenCalled();
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
  });

  it.each([false, true])("coalesces repeated play calls on the same resume (user activation: %s)", async (active) => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    mockUserActivation(active);
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    let resolveResume: () => void;
    MockAudioContext.resumeResultQueue = [
      new Promise<void>((resolve) => {
        resolveResume = resolve;
      })
    ];
    const resumeSpy = vi.spyOn(context, "resume");
    const createNodeSpy = vi.spyOn(context, "createBufferSource");

    audioSource.play();
    const resumePromise = (audioSource as any)._pendingPlay as Promise<void>;
    const thenSpy = vi.spyOn(resumePromise, "then");
    now.mockReturnValue(2000);
    audioSource.play();
    audioSource.play();

    expect((audioSource as any)._pendingPlay).toBe(resumePromise);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(thenSpy).not.toHaveBeenCalled();
    expect(createNodeSpy).not.toHaveBeenCalled();

    now.mockReturnValue(3000);
    resolveResume!();
    await resumePromise;
    await flushAsync();
    expect(audioSource.isPlaying).to.be.true;
    expect(createNodeSpy).toHaveBeenCalledTimes(1);
    expect((AudioManager as any)._playingCount).to.equal(1);
    expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 2);
  });

  describe("playback time compensation", () => {
    let audioSource: AudioSource;
    let context: MockAudioContext;
    let now: number;
    let resolveResume: () => void;
    let rejectResume: (error: Error) => void;

    beforeEach(() => {
      now = 0;
      vi.spyOn(performance, "now").mockImplementation(() => now);
      audioSource = createAudioSource();
      context = AudioManager.getContext() as unknown as MockAudioContext;
      MockAudioContext.resumeResultQueue = [
        new Promise<void>((resolve, reject) => {
          resolveResume = resolve;
          rejectResume = reject;
        })
      ];
    });

    async function finishResume(): Promise<void> {
      const resumePromise = (AudioManager as any)._resumePromise;
      resolveResume();
      await resumePromise;
      await flushAsync();
    }

    it.each([0, 0.5, 1, 2])("advances waiting playback at rate %s even when audio time is frozen", async (rate) => {
      audioSource.playbackRate = rate;
      audioSource.play();
      now = 2000;
      expect(audioSource.time).to.equal(2 * rate);
      expect(context.currentTime).to.equal(0);

      await finishResume();

      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 2 * rate);
      expect((audioSource as any)._sourceNode.playbackRate.value).to.equal(rate);
      expect(audioSource.time).to.equal(2 * rate);
      context.currentTime = 1;
      expect(audioSource.time).to.equal(3 * rate);
      expect((AudioManager as any)._playingCount).to.equal(1);
    });

    it.each([10000, 12000])(
      "skips an expired non-looping clip after waiting %sms without allocating a node",
      async (delay) => {
        const createNodeSpy = vi.spyOn(context, "createBufferSource");
        const createGainSpy = vi.spyOn(context, "createGain");
        audioSource.play();
        now = delay;
        await finishResume();

        expect(createNodeSpy).not.toHaveBeenCalled();
        expect(createGainSpy).not.toHaveBeenCalled();
        expect(audioSource.isPlaying).to.be.false;
        expect(audioSource.time).to.equal(0);
        expect((audioSource as any)._pendingPlay).to.be.null;
        expect((AudioManager as any)._playingCount).to.equal(0);

        audioSource.play();
        expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 0);
        expect(audioSource.isPlaying).to.be.true;
      }
    );

    it.each([1, -1])("preserves the loop phase across multiple elapsed loops (rate: %s)", async (rate) => {
      audioSource.loop = true;
      audioSource.playbackRate = rate;
      audioSource.play();
      now = 35000;
      await finishResume();

      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 5);
      expect(audioSource.time).to.equal(35 * rate);
      expect(audioSource.isPlaying).to.be.true;
    });

    it("integrates rate changes during the wait without applying the new rate retroactively", async () => {
      audioSource.play();
      now = 2000;
      audioSource.playbackRate = 2;
      expect(audioSource.time).to.equal(2);
      now = 5000;
      await finishResume();

      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 8);
      expect(audioSource.time).to.equal(8);
      context.currentTime = 0.5;
      expect(audioSource.time).to.equal(9);
    });

    it("keeps independent play times for sources sharing one resume", async () => {
      const otherSource = createAudioSource();
      const resumeSpy = vi.spyOn(context, "resume");
      audioSource.play();
      now = 1000;
      otherSource.play();
      now = 3000;
      await finishResume();

      expect(resumeSpy).toHaveBeenCalledTimes(1);
      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 3);
      expect((otherSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 2);
      expect((AudioManager as any)._playingCount).to.equal(2);
    });

    it("starts a fresh timeline after stop and replay even when both plays share the same resume", async () => {
      const createNodeSpy = vi.spyOn(context, "createBufferSource");
      audioSource.play();
      const resumePromise = (audioSource as any)._pendingPlay;
      now = 3000;
      audioSource.stop();
      now = 7000;
      audioSource.play();
      expect((audioSource as any)._pendingPlay).toBe(resumePromise);
      now = 7500;
      await finishResume();

      expect(createNodeSpy).toHaveBeenCalledTimes(1);
      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 0.5);
      expect((AudioManager as any)._playingCount).to.equal(1);
    });

    it("freezes the compensated position on pause and excludes time spent paused", async () => {
      audioSource.play();
      now = 2000;
      audioSource.pause();
      expect(audioSource.time).to.equal(2);
      now = 20000;
      expect(audioSource.time).to.equal(2);
      await finishResume();
      expect(audioSource.isPlaying).to.be.false;

      audioSource.play();
      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 2);
      expect(audioSource.time).to.equal(2);
    });

    it("adds recovery delay to the existing paused position", async () => {
      context.state = "running";
      context.currentTime = 10;
      audioSource.play();
      context.currentTime = 13;
      audioSource.pause();
      expect(audioSource.time).to.equal(3);

      context.state = "suspended";
      now = 10000;
      audioSource.play();
      now = 12000;
      await finishResume();

      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 5);
      expect(audioSource.time).to.equal(5);
    });

    it("preserves a compensated offset when paused at audio context time zero", async () => {
      audioSource.play();
      now = 2000;
      await finishResume();
      expect(context.currentTime).to.equal(0);

      audioSource.pause();
      now = 20000;
      expect(audioSource.time).to.equal(2);
      audioSource.play();
      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 2);
      expect((AudioManager as any)._playingCount).to.equal(1);
    });

    it("keeps playback time continuous through rate changes and pause/resume", () => {
      context.state = "running";
      context.currentTime = 5;
      audioSource.playbackRate = 2;
      audioSource.play();
      context.currentTime = 7;
      expect(audioSource.time).to.equal(4);
      audioSource.playbackRate = 0.5;
      expect(audioSource.time).to.equal(4);
      context.currentTime = 9;
      audioSource.pause();
      expect(audioSource.time).to.equal(5);

      now = 50000;
      context.currentTime = 20;
      audioSource.play();
      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 5);
      context.currentTime = 22;
      expect(audioSource.time).to.equal(6);
    });

    it.each(["pause", "stop"] as const)("keeps the position fixed when changing rate after %s", (action) => {
      context.state = "running";
      audioSource.play();
      context.currentTime = 2;
      audioSource[action]();
      const position = audioSource.time;

      now = 50000;
      context.currentTime = 20;
      const getContextSpy = vi.spyOn(AudioManager, "getContext");
      const nowSpy = vi.mocked(performance.now).mockClear();
      audioSource.playbackRate = 0.5;

      expect(audioSource.time).to.equal(position);
      expect(getContextSpy).not.toHaveBeenCalled();
      expect(nowSpy).not.toHaveBeenCalled();

      audioSource.play();
      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, position);
      expect((audioSource as any)._sourceNode.playbackRate.value).to.equal(0.5);
      context.currentTime = 22;
      expect(audioSource.time).to.equal(position + 1);
    });

    it("does not advance an already-playing node while its audio context is suspended", async () => {
      audioSource.play();
      now = 2000;
      await finishResume();
      context.currentTime = 1;
      expect(audioSource.time).to.equal(3);
      await AudioManager.suspend();
      now = 20000;
      expect(audioSource.time).to.equal(3);
    });

    it.each(["stop", "pause", "disable", "destroy", "replace clip"])(
      "does not start a cancelled pending play after %s",
      async (action) => {
        const createNodeSpy = vi.spyOn(context, "createBufferSource");
        audioSource.play();
        now = 1000;
        switch (action) {
          case "stop":
            audioSource.stop();
            break;
          case "pause":
            audioSource.pause();
            break;
          case "disable":
            audioSource.enabled = false;
            break;
          case "destroy":
            audioSource.destroy();
            break;
          case "replace clip":
            audioSource.clip = createAudioSource().clip;
            break;
        }
        now = 2000;
        await finishResume();

        expect(createNodeSpy).not.toHaveBeenCalled();
        expect(audioSource.isPlaying).to.be.false;
        expect((audioSource as any)._pendingPlay).to.be.null;
        expect((AudioManager as any)._playingCount).to.equal(0);
      }
    );

    it("does not start a pending play if the page becomes hidden before resume completes", async () => {
      const createNodeSpy = vi.spyOn(context, "createBufferSource");
      audioSource.play();
      now = 2000;
      const documentHidden = mockDocumentHidden(true);
      await finishResume();
      documentHidden.restore();

      expect(createNodeSpy).not.toHaveBeenCalled();
      expect((audioSource as any)._pendingPlay).to.be.null;
      expect((AudioManager as any)._playingCount).to.equal(0);
    });

    it("freezes the logical position and clears the request when resume rejects", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      audioSource.play();
      now = 2000;
      audioSource.playbackRate = 2;
      now = 3000;
      const resumePromise = (audioSource as any)._pendingPlay;
      rejectResume(new Error("resume failed"));
      await Promise.allSettled([resumePromise]);
      await flushAsync();

      expect(audioSource.time).to.equal(4);
      now = 10000;
      expect(audioSource.time).to.equal(4);
      expect(audioSource.isPlaying).to.be.false;
      expect((audioSource as any)._pendingPlay).to.be.null;
      expect((AudioManager as any)._playingCount).to.equal(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
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
    expect((audioSource as any)._pendingPlay).to.be.null;
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
    expect((audioSource as any)._pendingPlay).to.be.null;

    documentHidden.set(false);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    vi.advanceTimersByTime(100);
    documentHidden.restore();

    expect(audioSource.isPlaying).to.be.false;
    expect((audioSource as any)._pendingPlay).to.be.null;
  });

  it("replays the pending play on the resume it triggered", async () => {
    const audioSource = createAudioSource();
    const documentHidden = mockDocumentHidden(false);
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";

    audioSource.play();
    expect((audioSource as any)._pendingPlay).to.not.be.null;

    await flushAsync();
    documentHidden.restore();

    expect((audioSource as any)._pendingPlay).to.be.null;
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

    expect((audioSource as any)._pendingPlay).to.be.null;
    expect(audioSource.isPlaying).to.be.false;

    MockAudioContext.shouldResumeSucceed = true;
    mockUserActivation(true);
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;
  });

  it("lets an iOS gesture replace a pending resume without discarding a still-valid play", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const opening = createAudioSource();
    const bgm = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";

    let resolveColdStartResume: () => void;
    let resolveGestureResume: () => void;
    MockAudioContext.resumeResultQueue = [
      // iOS may leave a resume issued before user activation pending indefinitely
      new Promise<void>((resolve) => {
        resolveColdStartResume = resolve;
      }),
      new Promise<void>((resolve) => {
        resolveGestureResume = resolve;
      })
    ];
    const resumeSpy = vi.spyOn(context, "resume");

    opening.play();
    const coldStartResumePromise = (AudioManager as any)._resumePromise;
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect((opening as any)._pendingPlay).to.not.be.null;

    const userActivation = mockUserActivation(false);
    (AudioManager as any)._onUserGesture({ isTrusted: true, type: "touchstart" } as Event);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect((AudioManager as any)._resumePromise).toBe(coldStartResumePromise);
    expect((AudioManager as any)._resumeAttemptFromUserGesture).to.be.false;

    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    canvas.addEventListener("touchend", () => bgm.play(), { capture: true, passive: true, once: true });
    now.mockReturnValue(2000);
    userActivation.set(true);
    canvas.dispatchEvent(new Event("touchend", { bubbles: true }));

    const gestureResumePromise = (AudioManager as any)._resumePromise;
    expect(resumeSpy).toHaveBeenCalledTimes(2);
    expect(gestureResumePromise).not.toBe(coldStartResumePromise);
    expect((bgm as any)._pendingPlay).to.not.be.null;

    // Repeated events coalesce once a gesture-originated attempt is active
    document.dispatchEvent(new Event("click"));
    expect(resumeSpy).toHaveBeenCalledTimes(2);
    expect((AudioManager as any)._resumePromise).toBe(gestureResumePromise);

    // Earlier successful resumes still allow playback, but must not clear the current gesture attempt
    now.mockReturnValue(3000);
    resolveColdStartResume!();
    await coldStartResumePromise;
    await flushAsync();
    expect((AudioManager as any)._resumePromise).toBe(gestureResumePromise);
    expect((opening as any)._pendingPlay).to.be.null;
    expect(opening.isPlaying).to.be.true;
    expect((opening as any)._sourceNode.start).toHaveBeenCalledWith(0, 2);
    expect(bgm.isPlaying).to.be.false;

    now.mockReturnValue(4000);
    resolveGestureResume!();
    await gestureResumePromise;
    await flushAsync();
    expect((bgm as any)._pendingPlay).to.be.null;
    expect(bgm.isPlaying).to.be.true;
    expect(opening.isPlaying).to.be.true;
    expect((bgm as any)._sourceNode.start).toHaveBeenCalledWith(0, 2);
    canvas.remove();

    expect((AudioManager as any)._resumePromise).to.be.null;
  });

  it.each(["window", "canvas"])(
    "adopts a gesture resume without restarting the source's timeline (%s)",
    async (target) => {
      const now = vi.spyOn(performance, "now").mockReturnValue(1000);
      const audioSource = createAudioSource();
      const otherSource = createAudioSource();
      const context = AudioManager.getContext() as unknown as MockAudioContext;
      let resolveColdStartResume: () => void;
      let resolveGestureResume: () => void;
      MockAudioContext.resumeResultQueue = [
        new Promise<void>((resolve) => {
          resolveColdStartResume = resolve;
        }),
        new Promise<void>((resolve) => {
          resolveGestureResume = resolve;
        })
      ];
      const resumeSpy = vi.spyOn(context, "resume");
      const createNodeSpy = vi.spyOn(context, "createBufferSource");

      audioSource.play();
      otherSource.play();
      const coldStartResumePromise = (AudioManager as any)._resumePromise;
      const canvas = document.createElement("canvas");
      document.body.appendChild(canvas);
      // Window capture precedes the Manager listener; canvas capture follows it
      (target === "window" ? window : canvas).addEventListener("touchend", () => audioSource.play(), {
        capture: true,
        passive: true,
        once: true
      });
      now.mockReturnValue(2000);
      mockUserActivation(true);
      canvas.dispatchEvent(new Event("touchend", { bubbles: true }));
      canvas.remove();
      const gestureResumePromise = (AudioManager as any)._resumePromise;

      expect(resumeSpy).toHaveBeenCalledTimes(2);
      expect(gestureResumePromise).not.toBe(coldStartResumePromise);
      // Both native resumes settle after unlocking; the old one need not stay pending forever
      now.mockReturnValue(3000);
      resolveColdStartResume!();
      resolveGestureResume!();
      await Promise.all([coldStartResumePromise, gestureResumePromise]);
      await flushAsync();

      expect(context.state).to.equal("running");
      expect(audioSource.isPlaying).to.be.true;
      expect((audioSource as any)._pendingPlay).to.be.null;
      expect(otherSource.isPlaying).to.be.true;
      expect((otherSource as any)._pendingPlay).to.be.null;
      expect(createNodeSpy).toHaveBeenCalledTimes(2);
      expect((AudioManager as any)._playingCount).to.equal(2);
      expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 2);
      expect((otherSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 2);
    }
  );

  it("starts a new play immediately after unlock before the pending callback settles", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    let resolveResume: () => void;
    MockAudioContext.resumeResultQueue = [
      new Promise<void>((resolve) => {
        resolveResume = resolve;
      })
    ];
    const createNodeSpy = vi.spyOn(context, "createBufferSource");

    audioSource.play();
    const resumePromise = (audioSource as any)._pendingPlay;
    // Context state can become running before the pending Promise callback executes
    now.mockReturnValue(2500);
    context.state = "running";
    audioSource.play();
    expect(audioSource.isPlaying).to.be.true;
    expect((audioSource as any)._sourceNode.start).toHaveBeenCalledWith(0, 1.5);
    expect((audioSource as any)._pendingPlay).to.be.null;

    resolveResume!();
    await resumePromise;
    await flushAsync();
    expect(createNodeSpy).toHaveBeenCalledTimes(1);
    expect((AudioManager as any)._playingCount).to.equal(1);
  });

  it.each([false, true])("keeps a restarted play pending when the old resume settles (reject: %s)", async (reject) => {
    const audioSource = createAudioSource();
    const documentHidden = mockDocumentHidden(false);
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";

    let settleColdStartResume: () => void;
    let resolveGestureResume: () => void;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    MockAudioContext.resumeResultQueue = [
      new Promise<void>((resolve, rejectResume) => {
        settleColdStartResume = () => (reject ? rejectResume(new Error("old resume failed")) : resolve());
      }),
      new Promise<void>((resolve) => {
        resolveGestureResume = resolve;
      })
    ];

    audioSource.play();
    const coldStartResumePromise = (AudioManager as any)._resumePromise;

    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    canvas.addEventListener(
      "touchend",
      () => {
        audioSource.stop();
        audioSource.play();
      },
      { capture: true, passive: true, once: true }
    );
    mockUserActivation(true);
    canvas.dispatchEvent(new Event("touchend", { bubbles: true }));

    const gestureResumePromise = (AudioManager as any)._resumePromise;
    expect(gestureResumePromise).not.toBe(coldStartResumePromise);

    settleColdStartResume!();
    await Promise.allSettled([coldStartResumePromise]);
    await flushAsync();
    expect(audioSource.isPlaying).to.be.false;
    expect((audioSource as any)._pendingPlay).toBe(gestureResumePromise);
    expect(warnSpy).not.toHaveBeenCalled();

    resolveGestureResume!();
    await gestureResumePromise;
    await flushAsync();
    documentHidden.restore();
    canvas.remove();

    expect(audioSource.isPlaying).to.be.true;
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
    expect((audioSource as any)._pendingPlay).to.not.be.null;

    audioSource.stop();
    expect((audioSource as any)._pendingPlay).to.be.null;

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

    expect((audioSource as any)._pendingPlay).to.be.null;
    expect((AudioManager as any)._interruptionRecoveryPending).to.be.false;

    MockAudioContext.shouldResumeSucceed = true;
    mockUserActivation(true);
    document.dispatchEvent(new Event("click"));
    await flushAsync();

    expect(audioSource.isPlaying).to.be.false;
  });

  it("resume() unlocks a suspended context and clears the gesture flag", async () => {
    createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";
    (AudioManager as any)._interruptionRecoveryPending = true;

    await AudioManager.resume();

    expect(context.state).to.equal("running");
    expect((AudioManager as any)._interruptionRecoveryPending).to.be.false;
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

  it.each([false, true])(
    "keeps pending playback when another consumer resumes after success (user activation: %s)",
    async (active) => {
      const audioSource = createAudioSource();
      const context = AudioManager.getContext() as unknown as MockAudioContext;
      const userActivation = mockUserActivation(true);
      await AudioManager.resume();
      userActivation.set(false);
      await AudioManager.suspend();

      let resolveFirst: () => void;
      MockAudioContext.resumeResultQueue = [
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        })
      ];
      const resumeSpy = vi.spyOn(context, "resume");
      const createNodeSpy = vi.spyOn(context, "createBufferSource");
      const first = AudioManager.resume();
      // This consumer runs before the source's callback, after the first resume has completed
      const later = first.then(() => {
        userActivation.set(active);
        return AudioManager.resume();
      });
      audioSource.play();
      expect(resumeSpy).toHaveBeenCalledTimes(1);

      resolveFirst!();
      await later;
      await flushAsync();

      expect(resumeSpy).toHaveBeenCalledTimes(2);
      expect(context.state).to.equal("running");
      expect(audioSource.isPlaying).to.be.true;
      expect(createNodeSpy).toHaveBeenCalledTimes(1);
    }
  );

  it.each([false, true])("settles each source's own resume across recovery cycles (reject: %s)", async (reject) => {
    const firstSource = createAudioSource();
    const secondSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    const userActivation = mockUserActivation(false);
    const settleResumes: Array<() => void> = [];
    const error = new Error("superseded resume");
    const pendingResumes = [firstSource, secondSource].map(
      () =>
        new Promise<void>((resolve, rejectResume) => {
          settleResumes.push(() => (reject ? rejectResume(error) : resolve()));
        })
    );
    const createNodeSpy = vi.spyOn(context, "createBufferSource");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    MockAudioContext.resumeResultQueue = [pendingResumes[0], Promise.resolve()];
    firstSource.play();
    const firstResume = AudioManager.resume();
    userActivation.set(true);
    await AudioManager.resume();

    await AudioManager.suspend();
    userActivation.set(false);
    MockAudioContext.resumeResultQueue = [pendingResumes[1], Promise.resolve()];
    secondSource.play();
    const secondResume = AudioManager.resume();
    userActivation.set(true);
    await AudioManager.resume();

    settleResumes.forEach((settle) => settle());
    await Promise.allSettled([firstResume, secondResume]);
    await flushAsync();

    expect(firstSource.isPlaying).to.equal(!reject);
    expect(secondSource.isPlaying).to.equal(!reject);
    expect(createNodeSpy).toHaveBeenCalledTimes(reject ? 0 : 2);
    expect(warnSpy).toHaveBeenCalledTimes(reject ? 2 : 0);
  });

  it("ignores synthetic gesture events while allowing an activated resume to supersede", async () => {
    createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";

    let resolveProgrammaticResume: () => void;
    let resolveGestureResume: () => void;
    MockAudioContext.resumeResultQueue = [
      new Promise<void>((resolve) => {
        resolveProgrammaticResume = resolve;
      }),
      new Promise<void>((resolve) => {
        resolveGestureResume = resolve;
      })
    ];
    const resumeSpy = vi.spyOn(context, "resume");
    const userActivation = mockUserActivation(false);

    const programmaticResumePromise = AudioManager.resume();
    document.dispatchEvent(new Event("click"));
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect((AudioManager as any)._resumePromise).toBe(programmaticResumePromise);
    expect((AudioManager as any)._resumeAttemptFromUserGesture).to.be.false;

    userActivation.set(true);
    const gestureResumePromise = AudioManager.resume();
    expect(resumeSpy).toHaveBeenCalledTimes(2);
    expect(gestureResumePromise).not.toBe(programmaticResumePromise);
    expect((AudioManager as any)._resumeAttemptFromUserGesture).to.be.true;

    document.dispatchEvent(new Event("click"));
    expect(resumeSpy).toHaveBeenCalledTimes(2);
    expect((AudioManager as any)._resumePromise).toBe(gestureResumePromise);

    resolveProgrammaticResume!();
    await programmaticResumePromise;
    await flushAsync();
    expect((AudioManager as any)._resumePromise).toBe(gestureResumePromise);

    resolveGestureResume!();
    await gestureResumePromise;
    await flushAsync();
    expect((AudioManager as any)._resumePromise).to.be.null;
  });

  it("recognizes a pre-document gesture play without the User Activation API", async () => {
    mockUserActivation(undefined);
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "suspended";

    let resolveEarlyResume: () => void;
    MockAudioContext.resumeResultQueue = [
      new Promise<void>((resolve) => {
        resolveEarlyResume = resolve;
      })
    ];
    const resumeSpy = vi.spyOn(context, "resume");
    const touchEnd = { isTrusted: true, type: "touchend" } as Event;
    vi.spyOn(window, "event", "get").mockReturnValue(touchEnd);

    // An application window-capture listener runs before AudioManager's document-capture listener
    audioSource.play();
    const earlyResumePromise = (AudioManager as any)._resumePromise as Promise<void>;
    (AudioManager as any)._onUserGesture(touchEnd);
    const documentResumePromise = (AudioManager as any)._resumePromise as Promise<void>;
    expect(documentResumePromise).toBe(earlyResumePromise);

    resolveEarlyResume!();
    await earlyResumePromise;
    await flushAsync();

    expect(audioSource.isPlaying).to.be.true;
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not auto-resume a caller-controlled suspend on a later gesture", async () => {
    createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";
    const resumeSpy = vi.spyOn(context, "resume");

    await AudioManager.suspend();
    await flushAsync();

    mockUserActivation(true);
    document.dispatchEvent(new Event("click"));
    document.dispatchEvent(new Event("touchend"));
    await flushAsync();

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(context.state).to.equal("suspended");
    expect((AudioManager as any)._interruptionRecoveryPending).to.be.false;
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

    expect((AudioManager as any)._interruptionRecoveryPending).to.be.true;
    expect(context.state).to.equal("suspended");

    vi.useRealTimers();
    MockAudioContext.resumeResultQueue = null;
    MockAudioContext.shouldResumeSucceed = true;
    mockUserActivation(true);
    document.dispatchEvent(new Event("click"));
    await flushAsync();
    documentHidden.restore();

    expect((AudioManager as any)._interruptionRecoveryPending).to.be.false;
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

  // a gesture landing inside the 100ms recovery window must NOT resume: the timer still owns it, and
  // a gesture resume here would both double-call context.resume() and fire before the suspend settled
  it("ignores a gesture while recovery is in flight, leaving the single timer resume", async () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    context.state = "suspended";

    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    // recovery in flight: _recovering true, gesture-fallback armed, timer not yet fired
    expect((AudioManager as any)._recovering).to.be.true;

    const resumeSpy = vi.spyOn(context, "resume");
    mockUserActivation(true);
    document.dispatchEvent(new Event("click")); // gesture inside the 100ms window
    await flushAsync();
    expect(resumeSpy).not.toHaveBeenCalled(); // gesture did NOT resume (recovery owns it)

    vi.advanceTimersByTime(100);
    await flushAsync();
    documentHidden.restore();

    // exactly one resume, from the timer; gesture did not double-call it
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(context.state).to.equal("running");
  });

  it("lets a gesture supersede a pending recovery resume and coalesces later events", async () => {
    vi.useFakeTimers();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    context.state = "suspended";

    let resolveRecoveryResume: () => void;
    let resolveGestureResume: () => void;
    MockAudioContext.resumeResultQueue = [
      new Promise<void>((resolve) => {
        resolveRecoveryResume = resolve;
      }),
      new Promise<void>((resolve) => {
        resolveGestureResume = resolve;
      })
    ];

    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    const resumeSpy = vi.spyOn(context, "resume");

    vi.advanceTimersByTime(100);
    await flushAsync();
    const recoveryResumePromise = (AudioManager as any)._resumePromise;
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect((AudioManager as any)._recovering).to.be.false;
    expect((AudioManager as any)._resumeAttemptFromUserGesture).to.be.false;

    mockUserActivation(true);
    document.dispatchEvent(new Event("click"));
    const gestureResumePromise = (AudioManager as any)._resumePromise;
    expect(resumeSpy).toHaveBeenCalledTimes(2);
    expect(gestureResumePromise).not.toBe(recoveryResumePromise);
    expect((AudioManager as any)._resumeAttemptFromUserGesture).to.be.true;

    for (let i = 0; i < 10; i++) {
      document.dispatchEvent(new Event("click"));
    }
    await flushAsync();
    expect(resumeSpy).toHaveBeenCalledTimes(2);
    expect((AudioManager as any)._resumePromise).toBe(gestureResumePromise);

    resolveRecoveryResume!();
    await recoveryResumePromise;
    await flushAsync();
    expect((AudioManager as any)._resumePromise).toBe(gestureResumePromise);
    expect((AudioManager as any)._interruptionRecoveryPending).to.be.true;

    resolveGestureResume!();
    await gestureResumePromise;
    await flushAsync();
    documentHidden.restore();

    expect(context.state).to.equal("running");
    expect((AudioManager as any)._resumePromise).to.be.null;
    expect((AudioManager as any)._interruptionRecoveryPending).to.be.false;
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

    context.currentTime = 7;
    audioSource.pause();
    expect((AudioManager as any)._playingCount).to.equal(playingCount - 1);
    expect(audioSource.isPlaying).to.be.false;
    expect(audioSource.time).to.equal(2);

    audioSource.play();
    const playingCount2 = (AudioManager as any)._playingCount;

    audioSource.stop();
    expect(audioSource.time).to.equal(0);
    expect((AudioManager as any)._playingCount).to.equal(playingCount2 - 1);
    expect((audioSource as any)._pendingPlay).to.be.null;
  });

  // stop() from a PAUSED state must reset the offset so the next play() starts from 0, not the pause point
  it("stop() resets the paused offset (play -> pause -> stop -> play starts from 0)", () => {
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";
    context.currentTime = 5;

    audioSource.play();
    context.currentTime = 8;
    audioSource.pause();
    expect(audioSource.time).to.equal(3);

    // stop() while paused (_isPlaying already false) must still clear the offset
    audioSource.stop();
    expect(audioSource.time).to.equal(0);

    context.currentTime = 12;
    audioSource.play();
    expect(audioSource.time).to.equal(0);
  });

  // a looping clip resumed past one full loop must start from the loop phase, not a clamped offset
  it("wraps the resume offset into the loop for a looping clip", () => {
    const audioSource = createAudioSource();
    audioSource.loop = true;
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";

    audioSource.play();
    context.currentTime = 35;
    audioSource.pause();
    audioSource.play();

    const sourceNode = (audioSource as any)._sourceNode;
    // start(0, offset): 35 % 10 = 5, not the clamped 35
    expect(sourceNode.start).toHaveBeenCalledWith(0, 5);
  });

  // suspend() must not create a context just to suspend it (would be the cold-ctx iOS zombie we avoid)
  // suspend() with no context is a no-op: it must NOT create a context AND must NOT flag a caller-suspend
  // (a ghost flag would later block foreground recovery once playback starts)
  it("does not create a context or flag a caller-suspend when suspend() runs before any playback", async () => {
    await AudioManager.suspend();

    expect((AudioManager as any)._context == null).to.be.true;
    expect((AudioManager as any)._suspendedByCaller).to.be.false;
  });

  // root cause regression: suspend() before first play (no ctx) must not leave a ghost flag that blocks
  // foreground recovery after the page is later backgrounded and restored
  it("recovers after suspend()-before-first-play then a hide/show cycle", async () => {
    vi.useFakeTimers();
    AudioManager.suspend();
    const audioSource = createAudioSource();
    const context = AudioManager.getContext() as unknown as MockAudioContext;
    context.state = "running";
    audioSource.play();
    expect((AudioManager as any)._suspendedByCaller).to.be.false;

    context.state = "suspended";
    const resumeSpy = vi.spyOn(context, "resume");
    const documentHidden = mockDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(100);
    await flushAsync();
    documentHidden.restore();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(context.state).to.equal("running");
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
