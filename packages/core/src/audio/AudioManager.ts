/**
 * @internal
 * Audio Manager
 */
export class AudioManager {
  /** @internal */
  private static _context: AudioContext;
  /** @internal */
  private static _listener: GainNode;

  static get context():AudioContext {
    if (!AudioManager._context) {
      AudioManager._context = new window.AudioContext();
    }
    return AudioManager._context;
  }

  static get listener(): GainNode {
    return AudioManager._listener;
  }

  static set listener(value: GainNode) {
    AudioManager._listener = value;
  }
}
