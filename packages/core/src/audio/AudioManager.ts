import { CompatibleAudioContext } from "./CompatibleAudioContext";

/**
 * @internal
 * Audio Manager.
 */
export class AudioManager {
  private static _context: CompatibleAudioContext;
  private static _gainNode: GainNode;

  static getContext(): CompatibleAudioContext {
    if (!AudioManager._context) {
      AudioManager._context = new CompatibleAudioContext();
    }
    return AudioManager._context;
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
}
