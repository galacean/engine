import { Vector4 } from "@oasis-engine/math";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";

/**
 * Tools for get time information.
 */
export class Time {
  private static _timeProperty = ShaderProperty.getByName("u_Time");
  private static _deltaTimeProperty = ShaderProperty.getByName("u_DeltaTime");

  private _frameCount: number = 0;
  private _deltaTime: number = 0;
  private _unscaledDeltaTime: number = 0;
  private _elapsedTime: number = 0;
  private _unscaledElapsedTime: number = 0;
  private _timeScale: number = 1.0;
  private _lastSystemTime: number;

  private _timeValue: Vector4 = new Vector4();
  private _deltaTimeValue: Vector4 = new Vector4();

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
   * The elapsed time in seconds of this frame.
   */
  get elapsedTime(): number {
    return this._elapsedTime;
  }

  /**
   * The unscaled elapsed time in seconds of this frame.
   */
  get unscaledElapsedTime(): number {
    return this._unscaledElapsedTime;
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
  _update(): void {
    const currentSystemTime = performance.now() / 1000;
    const unscaledDeltaTime = currentSystemTime - this._lastSystemTime;
    const deltaTime = unscaledDeltaTime * this._timeScale;

    this._unscaledDeltaTime = unscaledDeltaTime;
    this._unscaledElapsedTime += unscaledDeltaTime;
    this._deltaTime = deltaTime;
    this._elapsedTime += deltaTime;
    this._frameCount++;

    this._lastSystemTime = currentSystemTime;
  }

  /**
   * @internal
   */
  _updateSceneShaderData(shaderData: ShaderData): void {
    const timeValue = this._timeValue;
    const deltaTimeValue = this._deltaTimeValue;

    const time = this._elapsedTime;
    timeValue.set(time, Math.sin(time), Math.cos(time), 0);
    shaderData.setVector4(Time._timeProperty, timeValue);

    const deltaTime = this._deltaTime;
    deltaTimeValue.set(deltaTime, 0, 0, 0);
    shaderData.setVector4(Time._deltaTimeProperty, deltaTimeValue);
  }
}
