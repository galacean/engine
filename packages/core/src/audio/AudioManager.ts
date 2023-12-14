/**
 * @internal
 * Audio Manager
 */
export class AudioManager {
  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _unlocked: boolean = false;

  /**
   * Audio context
   */
  static get context(): AudioContext {
    if (!AudioManager._context) {
      AudioManager._context = new window.AudioContext();
    }
      if (AudioManager._context.state !== "running") {
        window.document.addEventListener("pointerdown", AudioManager._unlock, true);
    }
    return AudioManager._context;
  }

  /**
   * Audio GainNode.
   */
  static get gainNode(): GainNode {
    if(!AudioManager._gainNode){
      const gain = AudioManager.context.createGain();
      gain.connect(AudioManager.context.destination);
      AudioManager._gainNode = gain;
    }
    return AudioManager._gainNode;
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
