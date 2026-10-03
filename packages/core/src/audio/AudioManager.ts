/**
 * Audio Manager for managing global audio context and settings.
 */
export class AudioManager {
  /** @internal */
  static _playingCount = 0;

  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _resumePromise: Promise<void> = null;
  private static _resumeAttemptFromUserGesture = false;
  private static _interruptionRecoveryPending = false;
  private static _suspendedByCaller = false;
  private static _recovering = false;

  /**
   * Suspend the audio context.
   * @returns A promise that resolves when the audio context is suspended
   */
  static suspend(): Promise<void> {
    // A no-op suspend must not block later automatic recovery
    const context = AudioManager._context;
    if (!context) {
      return Promise.resolve();
    }
    AudioManager._suspendedByCaller = true;
    return context.suspend();
  }

  /**
   * Resume the audio context.
   * @remarks On iOS Safari, call within a user gesture to unlock audio.
   * @returns A promise that resolves when the audio context is resumed
   */
  static resume(): Promise<void> {
    AudioManager._suspendedByCaller = false;
    return AudioManager._requestResume(AudioManager._isUserGestureActive());
  }

  /**
   * @internal
   */
  static getContext(): AudioContext {
    let context = AudioManager._context;
    if (!context) {
      AudioManager._context = context = new window.AudioContext();
      document.addEventListener("visibilitychange", AudioManager._onVisibilityChange);
      // Handle iOS bfcache restores that skip visibilitychange
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

  private static _requestResume(fromUserGesture: boolean): Promise<void> {
    const resumePromise = AudioManager._resumePromise;
    // iOS needs a fresh native resume() when a gesture replaces a programmatic attempt
    return resumePromise && (!fromUserGesture || AudioManager._resumeAttemptFromUserGesture)
      ? resumePromise
      : AudioManager._startResume(fromUserGesture);
  }

  private static _startResume(fromUserGesture: boolean): Promise<void> {
    const resumePromise = AudioManager.getContext()
      .resume()
      .then(() => {
        if (AudioManager._resumePromise === resumePromise) {
          AudioManager._interruptionRecoveryPending = false;
        }
      })
      .finally(() => {
        if (AudioManager._resumePromise === resumePromise) {
          AudioManager._resumePromise = null;
        }
      });
    AudioManager._resumeAttemptFromUserGesture = fromUserGesture;
    AudioManager._resumePromise = resumePromise;
    return resumePromise;
  }

  private static _isUserGestureActive(event?: Event): boolean {
    const userActivation = navigator.userActivation;
    if (userActivation) {
      return userActivation.isActive;
    }
    event ??= window.event;
    // Safari <=16.3 has no User Activation API
    return (
      event?.isTrusted === true && (event.type === "touchstart" || event.type === "touchend" || event.type === "click")
    );
  }

  private static _onVisibilityChange(): void {
    if (document.hidden) {
      // Some platforms keep background audio running
      AudioManager._context?.suspend().catch(() => {});
    } else {
      AudioManager._recoverPlaybackContext();
    }
  }

  private static _recoverPlaybackContext(): void {
    // Reset iOS interrupted contexts before resuming: https://bugs.webkit.org/show_bug.cgi?id=263627
    // _recovering coalesces visibilitychange and bfcache pageshow
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
    AudioManager._interruptionRecoveryPending = true; // Keep gesture recovery available if resume fails or stalls
    const context = AudioManager.getContext();
    context.suspend().catch(() => {});
    // 100ms empirical iOS cooldown; suspend() may never settle
    setTimeout(() => {
      AudioManager._recovering = false;
      if (document.hidden || AudioManager._suspendedByCaller) {
        return;
      }
      AudioManager.resume().catch(() => {});
    }, 100);
  }

  private static _onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) {
      AudioManager._recoverPlaybackContext();
    }
  }

  private static _onUserGesture(event: Event): void {
    if (!AudioManager._isUserGestureActive(event)) {
      return;
    }

    // Preserve the interruption-recovery cooldown
    if (AudioManager._recovering || AudioManager._suspendedByCaller) {
      return;
    }

    const context = AudioManager._context;
    if (context.state === "running" || (!AudioManager._interruptionRecoveryPending && !AudioManager._resumePromise)) {
      return;
    }

    const resumePromise = AudioManager._requestResume(true);
    resumePromise.catch((e) => {
      console.warn("Failed to resume AudioContext:", e);
    });
  }
}
