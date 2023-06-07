import { Engine } from "../Engine";
import { ReferResource } from "../asset/ReferResource";

/**
 * Audio Clip
 */
export class AudioClip extends ReferResource {
  /** the name of clip */
  name: string;

  private _audioBuffer: AudioBuffer;

  /**
   * the number of discrete audio channels
   */
  get channels(): Readonly<number> {
    return this._audioBuffer.numberOfChannels;
  }

  /**
   * the sample rate, in samples per second
   */
  get sampleRate(): Readonly<number> {
    return this._audioBuffer.sampleRate;
  }

  /**
   * the duration, in seconds
   */
  get duration(): Readonly<number> {
    return this._audioBuffer.duration;
  }

  /**
   * get the clip's audio buffer
   */
  getData(): AudioBuffer {
    return this._audioBuffer;
  }

  /**
   * set audio buffer for the clip
   */
  setData(value: AudioBuffer): void {
    this._audioBuffer = value;
  }

  constructor(engine: Engine, name: string = null) {
    super(engine);
    this.name = name;
  }
}
