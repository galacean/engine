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
  get duration(): Readonly<number> {
    return this._audioBuffer.duration;
  }

  constructor(engine: Engine, name: string = "") {
    super(engine);
    this.name = name;
  }

  /**
   * Get the clip's audio buffer.
   */
  getAudioSource(): AudioBuffer {
    return this._audioBuffer;
  }

  /**
   * Set audio buffer for the clip.
   */
  setAudioSource(value: AudioBuffer): void {
    this._audioBuffer = value;
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this._audioBuffer = null;
    this.name = null;
  }
}
