/**
 * Audio Manager for managing global audio context and settings.
 */
export class AudioManager {
  /** @internal */
  static _playingCount = 0;

  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _needsUserGestureResume = false;
  private static _pendingSources = new Set<{ _resumePendingPlayback(): void }>();

  /**
   * Suspend the audio context.
   * @returns A promise that resolves when the audio context is suspended
   */
  static suspend(): Promise<void> {
    return AudioManager._context?.suspend() ?? Promise.resolve();
  }

  /**
   * Resume the audio context.
   * @remarks On iOS Safari, calling this within a user gesture (e.g., click/touch event handler) can pre-unlock audio and reduce playback delay.
   * @returns A promise that resolves when the audio context is resumed
   */
  static resume(): Promise<void> {
    const context = AudioManager._context;
    if (!context || context.state === "running") {
      return Promise.resolve();
    }
    return context
      .resume()
      .then(() => {
        AudioManager._needsUserGestureResume = false;
        AudioManager._resumePendingSources();
      });
  }

  /** @internal */
  static _registerPendingSource(source: { _resumePendingPlayback(): void }): void {
    AudioManager._pendingSources.add(source);
  }

  /** @internal */
  static _unregisterPendingSource(source: { _resumePendingPlayback(): void }): void {
    AudioManager._pendingSources.delete(source);
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
      // iOS Safari requires user gesture to resume AudioContext
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

  private static _onContextStateChange(): void {
    if (AudioManager._context?.state === "running") {
      AudioManager._needsUserGestureResume = false;
      AudioManager._resumePendingSources();
    }
  }

  private static _resumePendingSources(): void {
    if (!AudioManager._pendingSources.size || !AudioManager.isAudioContextRunning()) {
      return;
    }

    const pendingSources = Array.from(AudioManager._pendingSources);
    AudioManager._pendingSources.clear();

    for (let i = 0, n = pendingSources.length; i < n; i++) {
      pendingSources[i]._resumePendingPlayback();
    }
  }

  private static _onVisibilityChange(): void {
    const context = AudioManager._context;
    if (
      document.hidden ||
      !context ||
      (AudioManager._playingCount === 0 && AudioManager._pendingSources.size === 0) ||
      context.state === "running"
    ) {
      return;
    }

    AudioManager.resume()
      .then(() => {
        if (AudioManager._context?.state !== "running") {
          return AudioManager._prepareGestureResume();
        }
      })
      .catch(() => {
        return AudioManager._prepareGestureResume();
      });
  }

  private static _resumeAfterInterruption(): void {
    if (AudioManager._needsUserGestureResume || AudioManager._pendingSources.size > 0) {
      AudioManager.resume().catch((e) => {
        console.warn("Failed to resume AudioContext:", e);
      });
    }
  }

  private static _prepareGestureResume(): Promise<void> {
    // iOS WKWebView WebKit bug(Triggered in LingGuang App): AudioContext may be in a "zombie" state where
    // state reports "suspended" but resume() alone won't restart audio rendering.
    // Calling suspend() first forces a clean internal state reset before user gesture triggers resume.
    // Related: https://bugs.webkit.org/show_bug.cgi?id=263627
    return AudioManager.suspend()
      .catch(() => {})
      .then(() => {
        AudioManager._needsUserGestureResume = true;
      });
  }
}
