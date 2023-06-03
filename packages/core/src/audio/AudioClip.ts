/**
 * Audio Clip
 */
export class AudioClip {
  /** the name of clip */
  name: string;
  private _audioBuffer: AudioBuffer;

  /** the number of discrete audio channels */
  get channels(): Readonly<number> {
    return this._audioBuffer.numberOfChannels;
  }

  /** the sample rate, in samples per second */
  get sampleRate(): Readonly<number> {
    return this._audioBuffer.sampleRate;
  }

  /** the duration, in seconds */
  get duration(): Readonly<number> {
    return this._audioBuffer.duration;
  }

  constructor(name?: string) {
    this.name = name;
  }
  /** get the clip's audio buffer */
  public getData(): AudioBuffer {
    return this._audioBuffer;
  }
  /** set audio buffer for the clip */
  public setData(value: AudioBuffer) {
    this._audioBuffer = value;
  }
}
