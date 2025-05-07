/**
 * @internal
 * Audio Manager.
 */
export class AudioManager {
  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _isResuming = false;

  static getContext(): AudioContext {
    let context = AudioManager._context;
    if (!context) {
      AudioManager._context = context = new window.AudioContext();

      // Safari can't resume audio context without element interaction
      document.addEventListener("pointerdown", AudioManager._tryResume, true);
      document.addEventListener("touchend", AudioManager._tryResume, true);
      document.addEventListener("touchstart", AudioManager._tryResume, true);
    }
    return context;
  }

  static getGainNode(): GainNode {
    let gainNode = AudioManager._gainNode;
    if (!AudioManager._gainNode) {
      AudioManager._gainNode = gainNode = AudioManager.getContext().createGain();
      gainNode.connect(AudioManager.getContext().destination);
    }
    return gainNode;
  }

  static isAudioContextRunning(): boolean {
    if (AudioManager.getContext().state !== "running") {
      console.warn("The AudioContext is not running and requires user interaction, such as a click or touch.");
      return false;
    }
    return true;
  }

  private static _tryResume(): void {
    if (AudioManager._context.state !== "running") {
      if (AudioManager._isResuming) {
        return;
      }

      AudioManager._isResuming = true;
      AudioManager._context.resume().then(() => {
        AudioManager._isResuming = false;
      });
    }
  }
}
