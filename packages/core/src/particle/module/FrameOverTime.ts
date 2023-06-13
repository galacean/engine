import { ParticleCurve } from "./ParticleCurve";
import { IClone } from "@galacean/engine-design";
import { ParticleCurveMode } from "../enum";

/**
 * Curve to control frame speed based on lifetime.
 */
export class FrameOverTime implements IClone {
  /**
   * A single constant value for the entire curve.
   * @param constant - Constant value.
   */
  static createByConstant(constant: number = 0): FrameOverTime {
    const rotationOverLifetime = new FrameOverTime();
    rotationOverLifetime._mode = ParticleCurveMode.Constant;
    rotationOverLifetime._constant = constant;
    return rotationOverLifetime;
  }

  /**
   * Use one curve when evaluating numbers along this Min-Max curve.
   * @param overTime - A single curve to evaluate.
   */
  static createByOverTime(overTime: ParticleCurve): FrameOverTime {
    const rotationOverLifetime = new FrameOverTime();
    rotationOverLifetime._mode = ParticleCurveMode.Curve;
    rotationOverLifetime._overTime = overTime;
    return rotationOverLifetime;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum constants.
   * @param constantMin - The constant describing the minimum values to be evaluated.
   * @param constantMax - The constant describing the maximum values to be evaluated.
   */
  static createByRandomTwoConstant(constantMin: number = 0, constantMax: number = 0): FrameOverTime {
    const rotationOverLifetime = new FrameOverTime();
    rotationOverLifetime._mode = ParticleCurveMode.TwoConstants;
    rotationOverLifetime._constantMin = constantMin;
    rotationOverLifetime._constantMax = constantMax;
    return rotationOverLifetime;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum curves.
   * @param gradientFrameMin - The curve describing the minimum values.
   * @param gradientFrameMax - The curve describing the maximum values.
   */
  static createByRandomTwoOverTime(gradientFrameMin: ParticleCurve, gradientFrameMax: ParticleCurve): FrameOverTime {
    const rotationOverLifetime = new FrameOverTime();
    rotationOverLifetime._mode = ParticleCurveMode.TwoCurves;
    rotationOverLifetime._overTimeMin = gradientFrameMin;
    rotationOverLifetime._overTimeMax = gradientFrameMax;
    return rotationOverLifetime;
  }

  private _mode: ParticleCurveMode = ParticleCurveMode.Constant;
  private _constant: number = 0;
  private _overTime: ParticleCurve = null;
  private _constantMin: number = 0;
  private _constantMax: number = 0;
  private _overTimeMin: ParticleCurve = null;
  private _overTimeMax: ParticleCurve = null;

  /**
   * The mode that the min-max curve uses to evaluate values.
   */
  get mode(): ParticleCurveMode {
    return this._mode;
  }

  /**
   * The constant value.
   */
  get constant(): number {
    return this._constant;
  }

  /**
   * The curve
   */
  get frameOverTimeData(): ParticleCurve {
    return this._overTime;
  }

  /**
   * The constant for the lower bound.
   */
  get constantMin(): number {
    return this._constantMin;
  }

  /**
   * The constant for the upper bound.
   */
  get constantMax(): number {
    return this._constantMax;
  }

  /**
   * The curve for the lower bound
   */
  get frameOverTimeDataMin(): ParticleCurve {
    return this._overTimeMin;
  }

  /**
   * The curve for the upper bound
   */
  get frameOverTimeDataMax(): ParticleCurve {
    return this._overTimeMax;
  }

  /**
   * @override
   */
  cloneTo(destFrameOverTime: FrameOverTime): void {
    destFrameOverTime._mode = this._mode;
    destFrameOverTime._constant = this._constant;
    this._overTime && this._overTime.cloneTo(destFrameOverTime._overTime);
    destFrameOverTime._constantMin = this._constantMin;
    destFrameOverTime._constantMax = this._constantMax;
    this._overTimeMin && this._overTimeMin.cloneTo(destFrameOverTime._overTimeMin);
    this._overTimeMax && this._overTimeMax.cloneTo(destFrameOverTime._overTimeMax);
  }

  /**
   * @override
   */
  clone(): FrameOverTime {
    const destFrameOverTime = new FrameOverTime();
    this.cloneTo(destFrameOverTime);
    return destFrameOverTime;
  }
}
