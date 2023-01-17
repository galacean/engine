/**
 * Tools for get time information.
 */
export class Time {
  /** @internal */
  _frameCount: number = 0;

  private _clock: { now: () => number };
  private _time: number = 0;
  private _unscaledTime: number = 0;
  private _deltaTime: number = 0;
  private _unscaledDeltaTime: number = 0;
  private _timeScale: number = 1.0;
  private _lastSystemTime: number;

  /*
   * The total number of frames since the start of the engine.
   */
  get frameCount(): number {
    return this._frameCount;
  }

  /**
   * The interval in seconds from the last frame to the current frame.
   */
  get deltaTime(): number {
    return this._deltaTime;
  }

  /**
   * The unscaled interval in seconds from the last frame to the current frame.
   */
  get unscaledDeltaTime(): number {
    return this._deltaTime / this._timeScale;
  }

  /**
   * The time in seconds of this frame.
   */
  get time(): number {
    return this._time;
  }

  /**
   * The unscaled time in seconds of this frame.
   */
  get unscaledTime(): number {
    return this._time / this._timeScale;
  }

  /**
   * The scale of time.
   */
  get timeScale(): number {
    return this._timeScale;
  }

  set timeScale(value) {
    this._timeScale = value;
  }

  /**
   * Constructor of the Time.
   */
  constructor() {
    this._clock = performance ? performance : Date;
    const now = this._clock.now() / 1000;
    this._lastSystemTime = now;
  }

  /**
   * @internal
   */
  _reset() {
    this._lastSystemTime = this._clock.now() / 1000;
  }

  /**
   * @internal
   */
  _tick(): void {
    const systemTime = this._clock.now() / 1000;
    const deltaTime = (systemTime - this._lastSystemTime) * this._timeScale;

    this._deltaTime = deltaTime;
    this._time += deltaTime;
    this._frameCount++;

    this._lastSystemTime = systemTime;
  }
}
