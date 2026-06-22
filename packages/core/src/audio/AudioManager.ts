/**
 * Audio Manager for managing global audio context and settings.
 */
export class AudioManager {
  /** @internal */
  static _playingCount = 0;

  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _resumePromise: Promise<void> = null;
  private static _needsUserGestureResume = false;
  private static _suspendedByCaller = false;
  private static _recovering = false;

  /**
   * Suspend the audio context.
   * @returns A promise that resolves when the audio context is suspended
   */
  static suspend(): Promise<void> {
    AudioManager._suspendedByCaller = true;
    // No context yet means nothing is playing; don't create a (cold) one just to suspend it
    const context = AudioManager._context;
    return context ? context.suspend() : Promise.resolve();
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
    // Clear _recovering on the timer itself, NOT off a promise: suspending/resuming an "interrupted"
    // context on iOS may never settle, which would leave _recovering stuck true and block all later
    // recovery. The timer always fires, and 100ms already covers the bfcache double-dispatch window.
    // 100ms is an empirical delay; resuming too soon after suspend is unreliable.
    setTimeout(() => {
      AudioManager._recovering = false;
      // Hidden again during the delay, or a deliberate pause landed: don't resume on a backgrounded page
      if (document.hidden || AudioManager._suspendedByCaller) {
        return;
      }
      context
        .resume()
        .then(() => {
          AudioManager._needsUserGestureResume = false;
        })
        .catch(() => {});
    }, 100);
  }

  private static _onPageShow(event: PageTransitionEvent): void {
    // iOS Safari bfcache restore (persisted) needs recovery; a normal load has no suspended context
    if (event.persisted) {
      AudioManager._recoverPlaybackContext();
    }
  }

  private static _resumeAfterInterruption(): void {
    // iOS Safari fallback: when auto-resume is blocked, resume on the next user gesture
    if (!AudioManager._suspendedByCaller && AudioManager._needsUserGestureResume) {
      AudioManager.resume().catch((e) => {
        console.warn("Failed to resume AudioContext:", e);
      });
    }
  }
}
