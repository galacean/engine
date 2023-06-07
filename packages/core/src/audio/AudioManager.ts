/**
 * @internal
 * Audio Manager
 */
export class AudioManager {
  /** @internal */
  private static _context: AudioContext;
  /** @internal */
  private static _listener: GainNode;

  private static _unlocked: boolean = true;

  /**
   * Audio context
   */
  static get context(): AudioContext {
    if (!AudioManager._context) {
      AudioManager._context = new window.AudioContext();
    }
    if (AudioManager._context.state != "running") {
      AudioManager._unlock();
      window.document.addEventListener("mousedown", AudioManager._unlock, true);
      window.document.addEventListener("touchend", AudioManager._unlock, true);
      window.document.addEventListener("touchstart", AudioManager._unlock, true);
    }
    return AudioManager._context;
  }

  /**
   * Audio Listener. Can only have one listener in a Scene.
   */
  static get listener(): GainNode {
    return AudioManager._listener;
  }

  static set listener(value: GainNode) {
    AudioManager._listener = value;
  }

  private static _unlock(): void {
    if (AudioManager._unlocked) {
      return;
    }
    AudioManager._playEmptySound();
    if (AudioManager._context.state == "running") {
      window.document.removeEventListener("mousedown", AudioManager._unlock, true);
      window.document.removeEventListener("touchend", AudioManager._unlock, true);
      window.document.removeEventListener("touchstart", AudioManager._unlock, true);
      AudioManager._unlocked = true;
    }
  }

  private static _playEmptySound(): void {
    if (!AudioManager._context) {
      return;
    }
    const source = AudioManager.context.createBufferSource();
    source.buffer = AudioManager.context.createBuffer(1, 1, 22050);
    source.connect(AudioManager.context.destination);
    source.start(0, 0, 0);
  }
}
