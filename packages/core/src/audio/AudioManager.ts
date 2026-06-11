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
  private static _foregroundRestoreDelay = 300;
  private static _foregroundRestoreTimer: number | undefined;
  private static _hidden = false;
  private static _eventsBound = false;

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
      AudioManager._clearForegroundRestore();
      AudioManager._needsUserGestureResume = false;
      AudioManager._resumePendingSources();
      AudioManager._resumeInterruptedSources();
      return Promise.resolve();
    }
    return context.resume().then(() => {
      AudioManager._clearForegroundRestore();
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
      if (!AudioManager._eventsBound) {
        AudioManager._eventsBound = true;
        AudioManager._bindLifecycleEvents();
        AudioManager._bindGestureEvents();
      }
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
      if (AudioManager._hidden || AudioManager._needsUserGestureResume) {
        return;
      }
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

  private static _bindLifecycleEvents(): void {
    const hiddenProp = AudioManager._getHiddenProp();
    const visibilityEvents = [
      "visibilitychange",
      "mozvisibilitychange",
      "msvisibilitychange",
      "webkitvisibilitychange",
      "qbrowserVisibilityChange"
    ];

    for (let i = 0, n = visibilityEvents.length; i < n; i++) {
      document.addEventListener(visibilityEvents[i], (event) => {
        const hidden = hiddenProp ? Boolean((document as any)[hiddenProp] || (event as any)?.hidden) : document.hidden;
        hidden ? AudioManager._onHidden() : AudioManager._onShown();
      });
    }

    window.addEventListener("pagehide", AudioManager._onHidden);
    window.addEventListener("pageshow", AudioManager._onShown);
    document.addEventListener("pagehide", AudioManager._onHidden);
    document.addEventListener("pageshow", AudioManager._onShown);
  }

  private static _bindGestureEvents(): void {
    const gestureEvents = ["pointerdown", "pointerup", "touchstart", "touchend", "mouseup", "click"];
    for (let i = 0, n = gestureEvents.length; i < n; i++) {
      document.addEventListener(gestureEvents[i], AudioManager._resumeAfterInterruption, { passive: true });
    }
  }

  private static _getHiddenProp(): string {
    const doc = document as any;
    if (typeof doc.hidden !== "undefined") return "hidden";
    if (typeof doc.mozHidden !== "undefined") return "mozHidden";
    if (typeof doc.msHidden !== "undefined") return "msHidden";
    if (typeof doc.webkitHidden !== "undefined") return "webkitHidden";
    return "";
  }

  private static _hasResumeWork(): boolean {
    return (
      AudioManager._needsUserGestureResume ||
      AudioManager._pendingSources.size > 0 ||
      AudioManager._interruptedSources.size > 0
    );
  }

  private static _onHidden(): void {
    if (AudioManager._hidden) {
      return;
    }
    AudioManager._hidden = true;
    AudioManager._clearForegroundRestore();
    AudioManager.suspend().catch(() => {});
  }

  private static _onShown(): void {
    if (!AudioManager._hidden) {
      return;
    }
    AudioManager._hidden = false;

    if (AudioManager._hasResumeWork()) {
      AudioManager._prepareGestureResume();
      AudioManager._scheduleForegroundRestore();
    }
  }

  private static _resumeAfterInterruption(): void {
    if (AudioManager._hasResumeWork()) {
      AudioManager.resume().catch((e) => {
        console.warn("Failed to resume AudioContext:", e);
      });
    }
  }

  private static _scheduleForegroundRestore(): void {
    AudioManager._clearForegroundRestore();
    AudioManager._foregroundRestoreTimer = window.setTimeout(() => {
      AudioManager._foregroundRestoreTimer = undefined;
      AudioManager.resume().catch(() => AudioManager._prepareGestureResume());
    }, AudioManager._foregroundRestoreDelay);
  }

  private static _clearForegroundRestore(): void {
    if (AudioManager._foregroundRestoreTimer === undefined) {
      return;
    }
    window.clearTimeout(AudioManager._foregroundRestoreTimer);
    AudioManager._foregroundRestoreTimer = undefined;
  }

  private static _prepareGestureResume(): Promise<void> {
    // iOS WKWebView may report a resumable state while rendering is still frozen.
    // Force a clean context edge, then let a gesture or foreground retry restore sources.
    AudioManager._needsUserGestureResume = true;
    return AudioManager.suspend().catch(() => {});
  }
}
