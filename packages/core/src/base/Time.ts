/**
 * Tools for get time information.
 */
export class Time {
  private _frameCount: number = 0;
  private _deltaTime: number = 0;
  private _unscaledDeltaTime: number = 0;
  private _time: number = 0;
  private _unscaledTime: number = 0;
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
    return this._unscaledDeltaTime;
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
    return this._unscaledTime;
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
    this._lastSystemTime = performance.now() / 1000;
  }

  /**
   * @internal
   */
  _reset() {
    this._lastSystemTime = performance.now() / 1000;
  }

  /**
   * @internal
   */
  _tick(): void {
    const currentSystemTime = performance.now() / 1000;
    const unscaledDeltaTime = currentSystemTime - this._lastSystemTime;
    const deltaTime = unscaledDeltaTime * this._timeScale;

    this._unscaledDeltaTime = unscaledDeltaTime;
    this._unscaledTime += unscaledDeltaTime;
    this._deltaTime = deltaTime;
    this._time += deltaTime;
    this._frameCount++;

    this._lastSystemTime = currentSystemTime;
  }
}
