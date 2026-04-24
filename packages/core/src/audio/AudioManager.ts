type ResumableAudioSource = {
  _resumePendingPlayback(): void;
  _suspendPlaybackForInterruption(): boolean;
  _resumeInterruptedPlayback(): void;
};

/**
 * Audio Manager for managing global audio context and settings.
 */
export class AudioManager {
  /** @internal */
  static _playingCount = 0;

  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _needsUserGestureResume = false;
  private static _pendingSources = new Set<ResumableAudioSource>();
  private static _playingSources = new Set<ResumableAudioSource>();
  private static _interruptedSources = new Set<ResumableAudioSource>();

  /**
   * Suspend the audio context.
   * @returns A promise that resolves when the audio context is suspended
   */
  static suspend(): Promise<void> {
    AudioManager._suspendActiveSourcesForInterruption();
    return AudioManager._context?.suspend() ?? Promise.resolve();
  }

  /**
   * Resume the audio context.
   * @remarks On iOS Safari, calling this within a user gesture (e.g., click/touch event handler) can pre-unlock audio and reduce playback delay.
   * @returns A promise that resolves when the audio context is resumed
   */
  static resume(): Promise<void> {
    const context = AudioManager._context;
    if (!context) {
      return Promise.resolve();
    }
    if (context.state === "running") {
      AudioManager._needsUserGestureResume = false;
      AudioManager._resumePendingSources();
      AudioManager._resumeInterruptedSources();
      return Promise.resolve();
    }
    return context.resume().then(() => {
      AudioManager._needsUserGestureResume = false;
      AudioManager._resumePendingSources();
      AudioManager._resumeInterruptedSources();
    });
  }

  /** @internal */
  static _registerPendingSource(source: ResumableAudioSource): void {
    AudioManager._pendingSources.add(source);
  }

  /** @internal */
  static _unregisterPendingSource(source: ResumableAudioSource): void {
    AudioManager._pendingSources.delete(source);
  }

  /** @internal */
  static _registerPlayingSource(source: ResumableAudioSource): void {
    AudioManager._playingSources.add(source);
  }

  /** @internal */
  static _unregisterPlayingSource(source: ResumableAudioSource): void {
    AudioManager._playingSources.delete(source);
  }

  /** @internal */
  static _unregisterInterruptedSource(source: ResumableAudioSource): void {
    AudioManager._interruptedSources.delete(source);
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
      AudioManager._resumeInterruptedSources();
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

  private static _suspendActiveSourcesForInterruption(): void {
    if (!AudioManager._playingSources.size) {
      return;
    }

    const playingSources = Array.from(AudioManager._playingSources);
    for (let i = 0, n = playingSources.length; i < n; i++) {
      const source = playingSources[i];
      if (source._suspendPlaybackForInterruption()) {
        AudioManager._interruptedSources.add(source);
      }
    }
  }

  private static _resumeInterruptedSources(): void {
    if (!AudioManager._interruptedSources.size || !AudioManager.isAudioContextRunning()) {
      return;
    }

    const interruptedSources = Array.from(AudioManager._interruptedSources);
    AudioManager._interruptedSources.clear();

    for (let i = 0, n = interruptedSources.length; i < n; i++) {
      interruptedSources[i]._resumeInterruptedPlayback();
    }
  }

  private static _onVisibilityChange(): void {
    const context = AudioManager._context;
    if (!context) {
      return;
    }

    if (document.hidden) {
      AudioManager.suspend().catch(() => {});
      return;
    }

    if (
      (AudioManager._playingCount === 0 &&
        AudioManager._pendingSources.size === 0 &&
        AudioManager._interruptedSources.size === 0) ||
      context.state === "running"
    ) {
      AudioManager._resumePendingSources();
      AudioManager._resumeInterruptedSources();
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
    if (
      AudioManager._needsUserGestureResume ||
      AudioManager._pendingSources.size > 0 ||
      AudioManager._interruptedSources.size > 0
    ) {
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
