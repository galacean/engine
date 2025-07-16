import { EventDispatcher } from "./EventDispatcher";
import { Time } from "./Time";

/**
 * Callback function for ticker updates.
 */
export interface TickerCallback {
  (deltaTime: number): void;
}

/**
 * Configuration options for Ticker.
 */
export interface TickerOptions {
  /** Target frame rate (only effective when vSyncCount = 0) */
  targetFrameRate?: number;
  /** Number of vertical synchronization frames */
  vSyncCount?: number;
  /** Whether to start automatically */
  autoStart?: boolean;
}

/**
 * Ticker manages time and loop control for the engine.
 * Extracted from Engine to follow single responsibility principle.
 */
export class Ticker extends EventDispatcher {
  private _time: Time = new Time();
  private _vSyncCount: number = 1;
  private _targetFrameRate: number = 60;
  private _targetFrameInterval: number = 1000 / 60;
  private _vSyncCounter: number = 1;
  
  private _isPaused: boolean = true;
  private _requestId: number;
  private _timeoutId: number;
  private _destroyed: boolean = false;
  
  private _callbacks: Set<TickerCallback> = new Set();
  private _getRAF: () => typeof requestAnimationFrame;
  private _getCAF: () => typeof cancelAnimationFrame;

  private _tick = () => {
    if (this._destroyed) return;
    
    if (this._vSyncCount) {
      const raf = this._getRAF();
      this._requestId = raf(this._tick);
      if (this._vSyncCounter++ % this._vSyncCount === 0) {
        this._update();
        this._vSyncCounter = 1;
      }
    } else {
      this._timeoutId = window.setTimeout(this._tick, this._targetFrameInterval);
      this._update();
    }
  };

  constructor(options: TickerOptions = {}) {
    super();
    
    const {
      targetFrameRate = 60,
      vSyncCount = 1,
      autoStart = false
    } = options;
    
    this.targetFrameRate = targetFrameRate;
    this.vSyncCount = vSyncCount;
    
    // Default to browser APIs, can be overridden (e.g., for XR)
    this._getRAF = () => requestAnimationFrame;
    this._getCAF = () => cancelAnimationFrame;
    
    if (autoStart) {
      this.start();
    }
  }

  /**
   * Add a callback to be executed on each tick.
   */
  addCallback(callback: TickerCallback): void {
    this._callbacks.add(callback);
  }

  /**
   * Remove a callback from the ticker.
   */
  removeCallback(callback: TickerCallback): void {
    this._callbacks.delete(callback);
  }

  /**
   * Get the time information.
   */
  get time(): Time {
    return this._time;
  }

  /**
   * Get the target frame rate.
   */
  get targetFrameRate(): number {
    return this._targetFrameRate;
  }

  /**
   * Set the target frame rate.
   * @remarks Only takes effect when vSyncCount = 0 (vertical synchronization is turned off).
   */
  set targetFrameRate(value: number) {
    value = Math.max(0.000001, value);
    this._targetFrameRate = value;
    this._targetFrameInterval = 1000 / value;
  }

  /**
   * Get the number of vertical synchronization frames.
   */
  get vSyncCount(): number {
    return this._vSyncCount;
  }

  /**
   * Set the number of vertical synchronization frames.
   * @remarks 0 means that the vertical synchronization is turned off.
   */
  set vSyncCount(value: number) {
    this._vSyncCount = Math.max(0, Math.floor(value));
  }

  /**
   * Whether the ticker is paused.
   */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Whether the ticker is destroyed.
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Start the ticker.
   */
  start(): void {
    if (!this._isPaused || this._destroyed) return;
    this._isPaused = false;
    this._time._reset();
    
    if (this._vSyncCount) {
      const raf = this._getRAF();
      this._requestId = raf(this._tick);
    } else {
      this._timeoutId = window.setTimeout(this._tick, this._targetFrameInterval);
    }
    
    this.dispatch('start');
  }

  /**
   * Pause the ticker.
   */
  pause(): void {
    if (this._isPaused || this._destroyed) return;
    this._isPaused = true;
    
    const caf = this._getCAF();
    caf(this._requestId);
    clearTimeout(this._timeoutId);
    
    this.dispatch('pause');
  }

  /**
   * Destroy the ticker and clean up resources.
   */
  destroy(): void {
    if (this._destroyed) return;
    
    this.pause();
    this._callbacks.clear();
    this._destroyed = true;
    this.removeAllEventListeners();
    this.dispatch('destroy');
  }

  /**
   * Set custom animation frame providers (e.g., for XR).
   */
  setAnimationFrameProvider(
    getRAF: () => typeof requestAnimationFrame,
    getCAF: () => typeof cancelAnimationFrame
  ): void {
    this._getRAF = getRAF;
    this._getCAF = getCAF;
  }

  private _update(): void {
    this._time._update();
    const deltaTime = this._time.deltaTime;
    
    // Execute all callbacks
    for (const callback of this._callbacks) {
      callback(deltaTime);
    }
  }
} 