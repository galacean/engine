/**
 * @internal
 * Audio Manager
 */
export class AudioManager {
  private static _context: AudioContext;
  private static _listener: GainNode;
  private static _unlocked: boolean = false;

  /**
   * Audio context
   */
  static get context(): AudioContext {
    if (!AudioManager._context) {
      AudioManager._context = new window.AudioContext();}
      if (AudioManager._context.state !== "running") {
        window.document.addEventListener("pointerdown", AudioManager._unlock, true);
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
    AudioManager._context.resume().then(() => {
      if (AudioManager._context.state === "running") {
        window.document.removeEventListener("pointerdown", AudioManager._unlock, true);
        AudioManager._unlocked = true;
      }
    });
  }
}
