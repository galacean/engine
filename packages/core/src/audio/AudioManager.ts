/**
 * Audio Manager for managing global audio context and settings.
 */
export class AudioManager {
  /** @internal */
  static _playingCount = 0;
  /** @internal */
  static _resumeAttemptId = 0;
  /** @internal */
  static _resumeAttemptFromUserGesture = false;

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
    return AudioManager._resumePromise ?? AudioManager._startResume(false);
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
      document.addEventListener("touchstart", AudioManager._onUserGesture, { passive: true, capture: true });
      document.addEventListener("touchend", AudioManager._onUserGesture, { passive: true, capture: true });
      document.addEventListener("click", AudioManager._onUserGesture, true);
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

  private static _startResume(fromUserGesture: boolean): Promise<void> {
    const resumePromise = AudioManager.getContext()
      .resume()
      .then(() => {
        AudioManager._needsUserGestureResume = false;
      })
      .finally(() => {
        if (AudioManager._resumePromise === resumePromise) {
          AudioManager._resumePromise = null;
        }
      });
    AudioManager._resumeAttemptId++;
    AudioManager._resumeAttemptFromUserGesture = fromUserGesture;
    AudioManager._resumePromise = resumePromise;
    return resumePromise;
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
      // Track the timer attempt through AudioManager.resume(): programmatic callers coalesce with it,
      // while a later trusted gesture can supersede it if WebKit leaves it pending
      AudioManager.resume().catch(() => {});
    }, 100);
  }

  private static _onPageShow(event: PageTransitionEvent): void {
    // iOS Safari bfcache restore (persisted) needs recovery; a normal load has no suspended context
    if (event.persisted) {
      AudioManager._recoverPlaybackContext();
    }
  }

  private static _onUserGesture(): void {
    // _recovering: don't bypass the 100ms delay (would resume on a still-interrupted context)
    if (AudioManager._recovering || AudioManager._suspendedByCaller) {
      return;
    }

    const context = AudioManager._context;
    if (
      !context ||
      context.state === "running" ||
      (!AudioManager._needsUserGestureResume && !AudioManager._resumePromise)
    ) {
      return;
    }

    // A trusted gesture may supersede a pending programmatic attempt, while repeated
    // events coalesce with the active gesture attempt
    const resumePromise =
      AudioManager._resumePromise && AudioManager._resumeAttemptFromUserGesture
        ? AudioManager._resumePromise
        : AudioManager._startResume(true);
    resumePromise.catch((e) => {
      console.warn("Failed to resume AudioContext:", e);
    });
  }
}
