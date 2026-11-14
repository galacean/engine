import type { Engine } from "../Engine";
import { DisorderedArray } from "../utils/DisorderedArray";
import type { AudioListener } from "./AudioListener";
import type { AudioSource } from "./AudioSource";

/**
 * Audio Manager for managing global audio context and settings.
 */
export class AudioManager {
  /** @internal */
  static _playingCount = 0;

  /** @internal */
  static readonly _spatialSources = new DisorderedArray<AudioSource>();
  private static readonly _listeners: AudioListener[] = [];

  /** Current playback state, without creating a context before a user gesture. */
  static get state(): AudioContextState | "uninitialized" {
    return AudioManager._context?.state ?? "uninitialized";
  }

  /** Audio timeline in seconds. Stops advancing while the context is suspended. */
  static get currentTime(): number {
    const context = AudioManager._context;
    return context ? context.currentTime : 0;
  }

  /** @internal */
  static _addSpatialSource(source: AudioSource): void {
    if (source._spatialSourceIndex !== -1) return;
    const sources = AudioManager._spatialSources;
    source._spatialSourceIndex = sources.length;
    sources.add(source);
  }

  /** @internal */
  static _removeSpatialSource(source: AudioSource): void {
    const index = source._spatialSourceIndex;
    if (index === -1) return;
    const replaced = AudioManager._spatialSources.deleteByIndex(index);
    if (replaced) replaced._spatialSourceIndex = index;
    source._spatialSourceIndex = -1;
  }

  /** @internal */
  static _addListener(listener: AudioListener): void {
    AudioManager._listeners.push(listener);
    if (AudioManager._context) listener._synchronize(AudioManager._context);
  }

  /** @internal */
  static _removeListener(listener: AudioListener): void {
    const listeners = AudioManager._listeners;
    const index = listeners.indexOf(listener);
    if (index < 0) return;
    listeners.splice(index, 1);
    const context = AudioManager._context;
    if (!context) return;
    const current = listeners[listeners.length - 1];
    if (current) current._synchronize(context);
    else {
      context.listener.setPosition(0, 0, 0);
      context.listener.setOrientation(0, 0, -1, 0, 1, 0);
    }
  }

  /** @internal */
  static _update(engine: Engine): void {
    const context = AudioManager._context;
    if (!context || context.state !== "running") return;
    const listeners = AudioManager._listeners;
    const listener = listeners[listeners.length - 1];
    if (listener?.engine === engine && !listener.pendingDestroy) listener._synchronize(context);
    const sources = AudioManager._spatialSources;
    for (let i = 0, n = sources.length; i < n; i++) {
      const source = sources.get(i);
      if (source.engine === engine && !source.pendingDestroy) source._synchronizePosition();
    }
  }

  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _resumePromise: Promise<void> | null = null;
  private static _needsUserGestureResume = false;
  private static _suspendedByCaller = false;
  private static _recovering = false;

  /**
   * Suspend the audio context.
   * @returns A promise that resolves when the audio context is suspended
   */
  static suspend(): Promise<void> {
    // No context means nothing is playing: suspending is a no-op and must NOT flag a caller-suspend
    // (a ghost flag would later block foreground recovery), and don't create a cold context just to suspend
    const context = AudioManager._context;
    if (!context) {
      return Promise.resolve();
    }
    AudioManager._suspendedByCaller = true;
    return context.suspend();
  }

  /**
   * Resume the audio context.
   * @remarks On iOS Safari, calling this within a user gesture (e.g., click/touch event handler) can pre-unlock audio and reduce playback delay.
   * @returns A promise that resolves when the audio context is resumed
   */
  static resume(): Promise<void> {
    AudioManager._suspendedByCaller = false;
    return (AudioManager._resumePromise ??= AudioManager.getContext()
      .resume()
      .then(() => {
        AudioManager._needsUserGestureResume = false;
      })
      .finally(() => {
        AudioManager._resumePromise = null;
      }));
  }

  /**
   * @internal
   */
  static getContext(): AudioContext {
    let context = AudioManager._context;
    if (!context) {
      AudioManager._context = context = new window.AudioContext();
      const listeners = AudioManager._listeners;
      listeners[listeners.length - 1]?._synchronize(context);
      document.addEventListener("visibilitychange", AudioManager._onVisibilityChange);
      // iOS Safari bfcache restore fires pageshow (persisted) but NOT visibilitychange, so recover here too
      window.addEventListener("pageshow", AudioManager._onPageShow);
      // iOS Safari requires a user gesture to resume the AudioContext
      document.addEventListener("touchstart", AudioManager._resumeAfterInterruption, { passive: true });
      document.addEventListener("touchend", AudioManager._resumeAfterInterruption, { passive: true });
      document.addEventListener("click", AudioManager._resumeAfterInterruption);
    }
    return context;
  }

  /**
   * @internal
   */
  static getGainNode(): GainNode {
    let gainNode = AudioManager._gainNode;
    if (!gainNode) {
      const context = AudioManager.getContext();
      AudioManager._gainNode = gainNode = context.createGain();
      gainNode.connect(context.destination);
    }
    return gainNode;
  }

  /**
   * @internal
   */
  static isAudioContextRunning(): boolean {
    return AudioManager.getContext().state === "running";
  }

  private static _onVisibilityChange(): void {
    if (document.hidden) {
      // Desktop/Android don't auto-suspend a running WebAudio context when backgrounded (only iOS does),
      // so suspend here to stop audio in the background; only if a context already exists (don't create one)
      AudioManager._context?.suspend().catch(() => {});
    } else {
      AudioManager._recoverPlaybackContext();
    }
  }

  private static _recoverPlaybackContext(): void {
    // Returning to foreground with a non-running context (and not a deliberate pause): iOS leaves it
    // "interrupted", which cannot be resumed directly; suspend() first transitions it to "suspended",
    // then resume() restarts the pipeline https://bugs.webkit.org/show_bug.cgi?id=263627
    // _recovering guards re-entry: a bfcache restore fires both visibilitychange and pageshow
    if (
      AudioManager._recovering ||
      document.hidden ||
      AudioManager._suspendedByCaller ||
      AudioManager._playingCount <= 0 ||
      AudioManager.isAudioContextRunning()
    ) {
      return;
    }
    AudioManager._recovering = true;
    AudioManager._needsUserGestureResume = true; // fallback if the auto-resume below is rejected
    const context = AudioManager.getContext();
    context.suspend().catch(() => {});
    // 100ms empirical delay (resume too soon after suspend is unreliable on iOS); _recovering is cleared
    // on the timer rather than off a promise because iOS may never settle suspend/resume in interrupted
    setTimeout(() => {
      AudioManager._recovering = false;
      if (document.hidden || AudioManager._suspendedByCaller) {
        return;
      }
      // Go through AudioManager.resume() so _resumePromise coalesces any gesture-resume racing us during
      // the slow iOS interrupted->running transition; a bare context.resume() here wouldn't dedupe
      AudioManager.resume().catch(() => {});
    }, 100);
  }

  private static _onPageShow(event: PageTransitionEvent): void {
    // iOS Safari bfcache restore (persisted) needs recovery; a normal load has no suspended context
    if (event.persisted) {
      AudioManager._recoverPlaybackContext();
    }
  }

  private static _resumeAfterInterruption(): void {
    // iOS Safari gesture fallback for when auto-resume is blocked.
    // _recovering: don't bypass the 100ms delay (would resume on a still-interrupted context)
    if (AudioManager._recovering || AudioManager._suspendedByCaller || !AudioManager._needsUserGestureResume) {
      return;
    }
    AudioManager.resume().catch((e) => {
      console.warn("Failed to resume AudioContext:", e);
    });
  }
}
