export class Ticker {
  private _vSyncCount: number = 1;
  private _vSyncCounter: number = 1;
  private _requestId: number = null;
  private _animationLoop: (...params) => any;
  private _requestAnimationFrame: (...params) => any;
  private _cancelAnimationFrame: (...params) => any;

  /**
   * The number of vertical synchronization means the number of vertical blanking for one frame.
   * @remarks 0 means that the vertical synchronization is turned off.
   */
  get vSyncCount(): number {
    return this._vSyncCount;
  }

  set vSyncCount(value: number) {
    this._vSyncCount = Math.max(0, Math.floor(value));
  }

  get requestAnimationFrame(): (...params) => any {
    return this._requestAnimationFrame;
  }

  set requestAnimationFrame(func: (...params) => any) {
    this._requestAnimationFrame = func;
  }

  get cancelAnimationFrame(): (...params) => any {
    return this._cancelAnimationFrame;
  }

  set cancelAnimationFrame(func: (...params) => any) {
    this._cancelAnimationFrame = func;
  }

  get animationLoop(): (...params) => any {
    return this._animationLoop;
  }

  set animationLoop(func: (...params) => any) {
    this._animationLoop = func;
  }

  /**
   * Pause the engine.
   */
  pause(): void {
    if (this._requestId) {
      this._cancelAnimationFrame(this._requestId);
      this._requestId = null;
    }
  }

  /**
   * Resume the engine.
   */
  resume(): void {
    this._requestId = requestAnimationFrame(this._onAnimationFrame);
  }

  private _onAnimationFrame(...param) {
    this._requestId = this._requestAnimationFrame(this._onAnimationFrame);
    if (this._vSyncCounter++ % this._vSyncCount === 0) {
      this._animationLoop(...param);
      this._vSyncCounter = 1;
    }
  }

  constructor() {
    this._onAnimationFrame = this._onAnimationFrame.bind(this);
  }
}
