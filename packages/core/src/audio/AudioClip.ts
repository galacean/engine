import { Engine } from "../Engine";
import { ReferResource } from "../asset/ReferResource";
import { AudioManager } from "./AudioManager";

/**
 * Audio Clip
 */
export class AudioClip extends ReferResource {
  /** @internal */
  _context: AudioContext;
  /**
   * Name of clip.
   */
  name: string;

  private _audioBuffer: AudioBuffer;

  /**
   * Number of discrete audio channels.
   */
  get channels(): number {
    return this._audioBuffer.numberOfChannels;
  }

  /**
   * Sample rate, in samples per second.
   */
  get sampleRate(): number {
    return this._audioBuffer.sampleRate;
  }

  /**
   * Duration, in seconds.
   */
  get duration(): Readonly<number> {
    return this._audioBuffer.duration;
  }

  /**
   * Get the clip's audio buffer.
   */
  getData(): AudioBuffer {
    return this._audioBuffer;
  }

  /**
   * Set audio buffer for the clip.
   */
  setData(value: AudioBuffer): void {
    this._audioBuffer = value;
  }

  constructor(engine: Engine, name: string = null) {
    super(engine);
    this.name = name;
    this._context = AudioManager.context;
  }
}
