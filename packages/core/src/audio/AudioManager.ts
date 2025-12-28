/**
 * @internal
 * Audio Manager.
 */
export class AudioManager {
  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _resumePromise: Promise<void> = null;

  static getContext(): AudioContext {
    let context = AudioManager._context;
    if (!context) {
      AudioManager._context = context = new window.AudioContext();
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
    return AudioManager.getContext().state === "running";
  }

  static resume(): Promise<void> {
    return (AudioManager._resumePromise ??= AudioManager._context.resume().then(() => {
      AudioManager._resumePromise = null;
    }));
  }
}
