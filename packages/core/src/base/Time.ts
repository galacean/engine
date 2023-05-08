import { Vector4 } from "@galacean/engine-math";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";

/**
 * Tools for calculating the time per frame.
 */
export class Time {
  private static _elapsedTimeProperty = Shader.getPropertyByName("scene_ElapsedTime");

  /** @internal */
  _frameCount: number = 0;

  private _clock: { now: () => number };
  private _timeScale: number;
  private _deltaTime: number;
  private _startTime: number;
  private _lastTickTime: number;

  private _elapsedTimeValue: Vector4 = new Vector4();

  /*
   * The total number of frames since the start of the engine.
   */
  get frameCount(): number {
    return this._frameCount;
  }

  /**
   * Constructor of the Time.
   */
  constructor() {
    this._clock = performance ? performance : Date;

    this._timeScale = 1.0;
    this._deltaTime = 0.0001;

    const now = this._clock.now();
    this._startTime = now;
    this._lastTickTime = now;
  }

  reset() {
    this._lastTickTime = this._clock.now();
  }

  /**
   * Current Time
   */
  get nowTime(): number {
    return this._clock.now();
  }

  /**
   * Time between two ticks
   */
  get deltaTime(): number {
    return this._deltaTime;
  }

  /**
   * Scaled delta time.
   */
  get timeScale(): number {
    return this._timeScale;
  }
  set timeScale(s) {
    this._timeScale = s;
  }

  /**
   * Unscaled delta time.
   */
  get unscaledDeltaTime(): number {
    return this._deltaTime / this._timeScale;
  }

  /**
   * The elapsed time, after the clock is initialized.
   */
  get timeSinceStartup(): number {
    return this.nowTime - this._startTime;
  }

  /**
   * Call every frame, update delta time and other data.
   */
  public tick(): void {
    const now = this.nowTime;
    this._deltaTime = (now - this._lastTickTime) * this._timeScale;
    this._lastTickTime = now;
    this._frameCount++;
  }

  /**
   * @internal
   */
  _updateSceneShaderData(shaderData: ShaderData): void {
    const { _elapsedTimeValue: elapsedTimeValue } = this;

    const time = this._lastTickTime / 1000;
    elapsedTimeValue.set(time, Math.sin(time), Math.cos(time), 0);
    shaderData.setVector4(Time._elapsedTimeProperty, elapsedTimeValue);
  }
}
