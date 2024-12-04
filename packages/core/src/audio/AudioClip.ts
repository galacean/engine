import { Engine } from "../Engine";
import { ReferResource } from "../asset/ReferResource";

/**
 * Audio Clip.
 */
export class AudioClip extends ReferResource {
  private _audioBuffer: AudioBuffer | null = null;

  /** Name of clip. */
  name: string;

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
  get duration(): number {
    return this._audioBuffer.duration;
  }

  constructor(engine: Engine, name: string = "") {
    super(engine);
    this.name = name;
  }

  /**
   * @internal
   */
  _getAudioSource(): AudioBuffer {
    return this._audioBuffer;
  }

  /**
   * @internal
   */
  _setAudioSource(value: AudioBuffer): void {
    this._audioBuffer = value;
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._audioBuffer = null;
    this.name = null;
  }
}
