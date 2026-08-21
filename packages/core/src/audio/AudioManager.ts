/**
 * Audio Manager for managing global audio context and settings.
 */
export class AudioManager {
  /** @internal */
  static _playingCount = 0;

  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _desiredState: "running" | "suspended" = "running";
  private static _resumePromise: Promise<void> = null;
  private static _recovering = false;
  private static _pendingPlaybacks = new Set<() => void>();

  /**
   * Suspend the audio context.
   * @returns A promise that resolves when the audio context is suspended
   */
  static suspend(): Promise<void> {
    // Don't create a cold context just to suspend it. With no context there is no playback state to preserve.
    const context = AudioManager._context;
    if (!context) {
      return Promise.resolve();
    }

    AudioManager._desiredState = "suspended";
    return context.suspend();
  }

  /**
   * Resume the audio context.
   * @remarks On iOS Safari, calling this within a user gesture (e.g., click/touch event handler) can pre-unlock audio and reduce playback delay.
   * @returns A promise that resolves when the audio context is resumed
   */
  static resume(): Promise<void> {
    AudioManager._desiredState = "running";
    return AudioManager._resumeContext(false);
  }

  /**
   * @internal
   */
  static getContext(): AudioContext {
    let context = AudioManager._context;
    if (!context) {
      AudioManager._context = context = new window.AudioContext();
      context.onstatechange = AudioManager._onContextStateChange;
      document.addEventListener("visibilitychange", AudioManager._onVisibilityChange);
      // iOS Safari bfcache restore fires pageshow (persisted) but NOT visibilitychange, so recover here too.
      window.addEventListener("pageshow", AudioManager._onPageShow);
      // A resume attempted before user activation may stay pending indefinitely. Each trusted gesture must
      // therefore be allowed to make a fresh native resume attempt instead of reusing that stale promise.
      document.addEventListener("touchstart", AudioManager._onUserGesture, {
        passive: true,
        capture: true
      });
      document.addEventListener("touchend", AudioManager._onUserGesture, {
        passive: true,
        capture: true
      });
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

  /** @internal */
  static _canStartPlayback(): boolean {
    return (
      AudioManager._desiredState === "running" && !document.hidden && AudioManager.getContext().state === "running"
    );
  }

  /** @internal */
  static _requestPlayback(playback: () => void): void {
    AudioManager._pendingPlaybacks.add(playback);
    AudioManager.getContext();

    if (AudioManager._canStartPlayback()) {
      AudioManager._flushPendingPlaybacks();
    } else if (
      AudioManager._desiredState === "running" &&
      !document.hidden &&
      !AudioManager._recovering &&
      !AudioManager._resumePromise
    ) {
      AudioManager._resumeContext(false).catch(AudioManager._warnResumeFailure);
    }
  }

  /** @internal */
  static _cancelPendingPlayback(playback: () => void): void {
    AudioManager._pendingPlaybacks.delete(playback);
  }

  private static _resumeContext(fromUserGesture: boolean): Promise<void> {
    const context = AudioManager.getContext();
    if (AudioManager._desiredState !== "running" || document.hidden) {
      return Promise.resolve();
    }
    if (context.state === "running") {
      AudioManager._flushPendingPlaybacks();
      return Promise.resolve();
    }
    if (!fromUserGesture && AudioManager._resumePromise) {
      return AudioManager._resumePromise;
    }

    let nativeResumePromise: Promise<void>;
    try {
      nativeResumePromise = context.resume();
    } catch (e) {
      return Promise.reject(e);
    }

    const resumePromise = nativeResumePromise.then(() => {
      AudioManager._reconcileContextState();
    });

    // Programmatic attempts are single-flight. Gesture attempts deliberately are not: a resume made before
    // activation may remain pending, and a later trusted gesture must be able to issue a fresh native call.
    if (!fromUserGesture) {
      const trackedPromise = resumePromise.finally(() => {
        if (AudioManager._resumePromise === trackedPromise) {
          AudioManager._resumePromise = null;
        }
      });
      AudioManager._resumePromise = trackedPromise;
      return trackedPromise;
    }

    return resumePromise;
  }

  private static _reconcileContextState(): void {
    const context = AudioManager._context;
    if (!context || context.state !== "running") {
      return;
    }

    // A successful gesture may start the context while an earlier programmatic resume promise is still
    // pending. Stop treating that stale promise as the active recovery attempt so a future interruption can
    // make a new automatic attempt even if the browser never settles the old promise.
    AudioManager._resumePromise = null;

    if (AudioManager._desiredState === "suspended" || document.hidden) {
      context.suspend().catch(() => {});
    } else {
      AudioManager._flushPendingPlaybacks();
    }
  }

  private static _flushPendingPlaybacks(): void {
    if (!AudioManager._canStartPlayback() || AudioManager._pendingPlaybacks.size === 0) {
      return;
    }

    const pendingPlaybacks = Array.from(AudioManager._pendingPlaybacks);
    AudioManager._pendingPlaybacks.clear();
    for (let i = 0, n = pendingPlaybacks.length; i < n; i++) {
      pendingPlaybacks[i]();
    }
  }

  private static _hasPlaybackDemand(): boolean {
    return AudioManager._playingCount > 0 || AudioManager._pendingPlaybacks.size > 0;
  }

  private static _onContextStateChange(): void {
    AudioManager._reconcileContextState();
  }

  private static _onVisibilityChange(): void {
    if (document.hidden) {
      // Desktop/Android don't auto-suspend a running WebAudio context when backgrounded (only iOS does),
      // so suspend here to stop audio in the background. This physical transition does not change the
      // caller's desired state, allowing foreground recovery to restore active playback.
      AudioManager._context?.suspend().catch(() => {});
    } else {
      AudioManager._recoverPlaybackContext();
    }
  }

  private static _recoverPlaybackContext(): void {
    // Returning to foreground with a non-running context: iOS may leave it "interrupted", which cannot be
    // resumed directly. suspend() first transitions it to "suspended", then resume() restarts the pipeline.
    // _recovering guards re-entry because bfcache restore may fire both visibilitychange and pageshow.
    if (
      AudioManager._recovering ||
      document.hidden ||
      AudioManager._desiredState !== "running" ||
      !AudioManager._hasPlaybackDemand()
    ) {
      return;
    }

    const context = AudioManager.getContext();
    if (context.state === "running") {
      AudioManager._flushPendingPlaybacks();
      return;
    }

    AudioManager._recovering = true;
    context.suspend().catch(() => {});
    // 100ms empirical delay: resuming too soon after suspend is unreliable on iOS. The guard is timer-based
    // because WebKit may leave the suspend/resume promises unsettled while the context is interrupted.
    setTimeout(() => {
      AudioManager._recovering = false;
      if (document.hidden || AudioManager._desiredState !== "running" || !AudioManager._hasPlaybackDemand()) {
        return;
      }
      AudioManager._resumeContext(false).catch(AudioManager._warnResumeFailure);
    }, 100);
  }

  private static _onPageShow(event: PageTransitionEvent): void {
    // iOS Safari bfcache restore (persisted) needs recovery; a normal load has no suspended context.
    if (event.persisted) {
      AudioManager._recoverPlaybackContext();
    }
  }

  private static _onUserGesture(): void {
    if (
      AudioManager._recovering ||
      document.hidden ||
      AudioManager._desiredState !== "running" ||
      !AudioManager._hasPlaybackDemand()
    ) {
      return;
    }

    const context = AudioManager._context;
    if (!context || context.state === "running") {
      return;
    }

    AudioManager._resumeContext(true).catch(AudioManager._warnResumeFailure);
  }

  private static _warnResumeFailure(error: unknown): void {
    console.warn("Failed to resume AudioContext:", error);
  }
}
