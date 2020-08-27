/**
 * 计算每帧时间的工具类
 * @class
 */
export class Time {
  private _clock: { now: () => number };

  private _timeScale: number;

  private _deltaTime: number;

  private _startTime: number;

  private _lastTickTime: number;
  /**
   * 初始化内部数据
   * @constructor
   */
  constructor() {
    // 优先使用 performance 进行计时
    this._clock = performance ? performance : Date;

    this._timeScale = 1.0;
    this._deltaTime = 0.0001;

    const now = this._clock.now();
    this._startTime = now;
    this._lastTickTime = now;
  }

  /**
   * 当前时间
   * @readonly
   */
  get nowTime(): number {
    return this._clock.now();
  }

  /**
   * 两次 tick 之间的时间
   * @readonly
   */
  get deltaTime(): number {
    return this._deltaTime;
  }

  /**
   * Delta Time 的缩放值
   */
  get timeScale(): number {
    return this._timeScale;
  }
  set timeScale(s) {
    this._timeScale = s;
  }

  /**
   * 未经缩放的 Delta Time 数值
   * @readonly
   */
  get unscaledDeltaTime(): number {
    return this._deltaTime / this._timeScale;
  }

  /**
   * 时钟初始化之后，经历的时间
   */
  get timeSinceStartup(): number {
    return this.nowTime - this._startTime;
  }

  /**
   * 每帧调用，更新 Delta Time 等内部数据
   */
  public tick(): void {
    const now = this.nowTime;
    this._deltaTime = (now - this._lastTickTime) * this._timeScale;
    this._lastTickTime = now;
  }
}
