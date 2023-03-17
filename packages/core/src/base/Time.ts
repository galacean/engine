import { Vector4 } from "@oasis-engine/math";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";

/**
 * Provide time related information.
 */
export class Time {
  private static _elapsedTimeProperty = ShaderProperty.getByName("u_ElapsedTime");
  private static _deltaTimeProperty = ShaderProperty.getByName("u_DeltaTime");

  private _frameCount: number = 0;
  private _deltaTime: number = 0;
  private _unscaledDeltaTime: number = 0;
  private _elapsedTime: number = 0;
  private _unscaledElapsedTime: number = 0;
  private _lastSystemTime: number;

  private _elapsedTimeValue: Vector4 = new Vector4();
  private _deltaTimeValue: Vector4 = new Vector4();

  /**
   * Maximum delta time allowed per frame in seconds.
   *
   * @remarks
   * When the frame rate is low or stutter occurs, `deltaTime` will not exceed the value of `maximumDeltaTime` * `timeScale`.
   */
  maximumDeltaTime: number = 0.333333;

  /** The scale of time. */
  timeScale: number = 1.0;

  /*
   * The total number of frames since the start of the engine.
   */
  get frameCount(): number {
    return this._frameCount;
  }

  /**
   * The delta time in seconds from the last frame to the current frame.
   */
  get deltaTime(): number {
    return this._deltaTime;
  }

  /**
   * The unscaled delta time in seconds from the last frame to the current frame.
   */
  get unscaledDeltaTime(): number {
    return this._unscaledDeltaTime;
  }

  /**
   * The amount of elapsed time in seconds since the start of the engine.
   */
  get elapsedTime(): number {
    return this._elapsedTime;
  }

  /**
   * The amount of unscaled elapsed time in seconds since the start of the engine.
   */
  get unscaledElapsedTime(): number {
    return this._unscaledElapsedTime;
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
    this._unscaledDeltaTime = unscaledDeltaTime;
    this._unscaledElapsedTime += unscaledDeltaTime;

    const deltaTime = Math.min(unscaledDeltaTime, this.maximumDeltaTime) * this.timeScale;
    this._deltaTime = deltaTime;
    this._elapsedTime += deltaTime;
    this._frameCount++;

    this._lastSystemTime = currentSystemTime;
  }

  /**
   * @internal
   */
  _updateSceneShaderData(shaderData: ShaderData): void {
    const elapsedTimeValue = this._elapsedTimeValue;
    const deltaTimeValue = this._deltaTimeValue;

    const time = this._elapsedTime;
    elapsedTimeValue.set(time, Math.sin(time), Math.cos(time), 0);
    shaderData.setVector4(Time._elapsedTimeProperty, elapsedTimeValue);

    const deltaTime = this._deltaTime;
    deltaTimeValue.set(deltaTime, 0, 0, 0);
    shaderData.setVector4(Time._deltaTimeProperty, deltaTimeValue);
  }
}
