/**
 * Audio Manager for managing global audio context and settings.
 */
export class AudioManager {
  /** @internal */
  static _playingCount = 0;

  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _needsUserGestureResume = false;
  private static _hidden = false;
  private static _foregroundResumeTimer: ReturnType<typeof setTimeout> | null = null;
  private static _suspendedByCaller = false;

  /**
   * Suspend the audio context.
   * @returns A promise that resolves when the audio context is suspended
   */
  static suspend(): Promise<void> {
    const context = AudioManager._context;
    if (!context) {
      return Promise.resolve();
    }
    AudioManager._suspendedByCaller = true;
    AudioManager._needsUserGestureResume = false;
    AudioManager._clearForegroundResumeTimer();
    AudioManager._removeGestureListeners();
    return context.suspend();
  }

  /**
   * Resume the audio context.
   * @remarks On iOS Safari, calling this within a user gesture (e.g., click/touch event handler) can pre-unlock audio and reduce playback delay.
   * @returns A promise that resolves when the audio context is resumed
   */
  static resume(): Promise<void> {
    AudioManager._suspendedByCaller = false;
    AudioManager._clearForegroundResumeTimer();
    if (document.hidden) {
      AudioManager._onHidden();
    }

    if (AudioManager._hidden) {
      return Promise.resolve();
    }

    const context = AudioManager.getContext();
    if (context.state === "running") {
      AudioManager._needsUserGestureResume = false;
      AudioManager._removeGestureListeners();
      return Promise.resolve();
    }
    return context.resume().then(() => {
      AudioManager._needsUserGestureResume = false;
      AudioManager._removeGestureListeners();
    });
  }

  /**
   * @internal
   */
  static getContext(): AudioContext {
    let context = AudioManager._context;
    if (!context) {
      AudioManager._context = context = new window.AudioContext();
      AudioManager._hidden = document.hidden;
      context.onstatechange = AudioManager._onContextStateChange;
      document.addEventListener("visibilitychange", AudioManager._onVisibilityChange);
      window.addEventListener("pagehide", AudioManager._onHidden);
      window.addEventListener("pageshow", AudioManager._onShown);
      AudioManager._addGestureListeners();
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

  private static _onContextStateChange(): void {
    const state = AudioManager._context?.state;
    if (state === "running" && !AudioManager._hidden) {
      AudioManager._suspendedByCaller = false;
      AudioManager._needsUserGestureResume = false;
      AudioManager._removeGestureListeners();
    } else if (
      state &&
      state !== "running" &&
      !AudioManager._hidden &&
      !AudioManager._suspendedByCaller &&
      !AudioManager._foregroundResumeTimer
    ) {
      AudioManager._needsUserGestureResume = true;
      AudioManager._addGestureListeners();
    }
  }

  private static _onVisibilityChange(): void {
    document.hidden ? AudioManager._onHidden() : AudioManager._onShown();
  }

  private static _onHidden(): void {
    const context = AudioManager._context;
    if (AudioManager._hidden && context?.state !== "running") {
      return;
    }
    AudioManager._hidden = true;
    AudioManager._clearForegroundResumeTimer();
    context?.suspend().catch(() => {});
  }

  private static _onShown(): void {
    if (!AudioManager._hidden) {
      return;
    }
    AudioManager._hidden = false;

    const context = AudioManager._context;
    if (!context || AudioManager._suspendedByCaller) {
      return;
    }
    const isForegroundResumeStale = (): boolean =>
      AudioManager._hidden || AudioManager._suspendedByCaller || AudioManager._context !== context;
    // iOS WKWebView zombie fix (https://bugs.webkit.org/show_bug.cgi?id=263627):
    // force suspend then resume after a short delay to reset the audio rendering pipeline.
    context.suspend().catch(() => {});
    AudioManager._foregroundResumeTimer = setTimeout(() => {
      AudioManager._foregroundResumeTimer = null;
      if (isForegroundResumeStale()) {
        return;
      }
      context
        .resume()
        .then(() => {
          if (isForegroundResumeStale()) {
            return;
          }
          AudioManager._needsUserGestureResume = false;
          AudioManager._removeGestureListeners();
        })
        .catch(() => {
          if (isForegroundResumeStale()) {
            return;
          }
          AudioManager._needsUserGestureResume = true;
          AudioManager._addGestureListeners();
        });
    }, 100);
  }

  private static _resumeAfterInterruption(): void {
    if (!AudioManager._suspendedByCaller && AudioManager._needsUserGestureResume) {
      AudioManager.resume().catch(() => {});
    }
  }

  private static _clearForegroundResumeTimer(): void {
    if (AudioManager._foregroundResumeTimer !== null) {
      clearTimeout(AudioManager._foregroundResumeTimer);
      AudioManager._foregroundResumeTimer = null;
    }
  }

  private static _addGestureListeners(): void {
    document.addEventListener("pointerup", AudioManager._resumeAfterInterruption, { passive: true });
    document.addEventListener("click", AudioManager._resumeAfterInterruption, { passive: true });
  }

  private static _removeGestureListeners(): void {
    document.removeEventListener("pointerup", AudioManager._resumeAfterInterruption);
    document.removeEventListener("click", AudioManager._resumeAfterInterruption);
  }
}
