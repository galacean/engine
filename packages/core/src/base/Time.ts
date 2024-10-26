import { Vector4 } from "@galacean/engine-math";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";

/**
 * Provide time related information.
 */
export class Time {
  private static _elapsedTimeProperty = ShaderProperty.getByName("scene_ElapsedTime");
  private static _deltaTimeProperty = ShaderProperty.getByName("scene_DeltaTime");

  private _frameCount: number = 0;
  private _deltaTime: number = 0;
  private _actualDeltaTime: number = 0;
  private _elapsedTime: number = 0;
  private _actualElapsedTime: number = 0;
  private _lastSystemTime: number;

  private _elapsedTimeValue: Vector4 = new Vector4();
  private _deltaTimeValue: Vector4 = new Vector4();

  /** Maximum delta time allowed per frame in seconds. */
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
   *
   * @remarks When the frame rate is low or stutter occurs, `deltaTime` will not exceed the value of `maximumDeltaTime` * `timeScale`.
   */
  get deltaTime(): number {
    return this._deltaTime;
  }

  /**
   * The amount of elapsed time in seconds since the start of the engine.
   */
  get elapsedTime(): number {
    return this._elapsedTime;
  }

  /**
   * The actual delta time in seconds from the last frame to the current frame.
   *
   * @remarks The actual delta time is not affected by `maximumDeltaTime` and `timeScale`.
   */
  get actualDeltaTime(): number {
    return this._actualDeltaTime;
  }

  /**
   * The amount of actual elapsed time in seconds since the start of the engine.
   */
  get actualElapsedTime(): number {
    return this._actualElapsedTime;
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

    const actualDeltaTime = currentSystemTime - this._lastSystemTime;
    this._actualDeltaTime = actualDeltaTime;
    this._actualElapsedTime += actualDeltaTime;

    const deltaTime = Math.min(actualDeltaTime, this.maximumDeltaTime) * this.timeScale;
    this._deltaTime = deltaTime;
    this._elapsedTime += deltaTime;
    this._frameCount++;

    this._lastSystemTime = currentSystemTime;
  }

  /**
   * @internal
   */
  _updateSceneShaderData(shaderData: ShaderData): void {
    const { _elapsedTimeValue: elapsedTimeValue, _deltaTimeValue: deltaTimeValue } = this;

    const time = this._elapsedTime;
    elapsedTimeValue.set(time, Math.sin(time), Math.cos(time), 0);
    shaderData.setVector4(Time._elapsedTimeProperty, elapsedTimeValue);

    deltaTimeValue.set(this._deltaTime, 0, 0, 0);
    shaderData.setVector4(Time._deltaTimeProperty, deltaTimeValue);
  }
}
