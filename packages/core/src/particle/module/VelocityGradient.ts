import { ParticleCurve } from "./ParticleCurve";
import { IClone } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { ParticleCurveMode } from "../enum";

/**
 * Curve to control particle speed based on lifetime
 */
export class VelocityGradient implements IClone {
  /**
   * A single constant value for the entire curve.
   * @param constant - Constant value.
   */
  static createByConstant(constant: Vector3): VelocityGradient {
    const gradientVelocity: VelocityGradient = new VelocityGradient();
    gradientVelocity._mode = ParticleCurveMode.Constant;
    gradientVelocity._constant = constant;
    return gradientVelocity;
  }

  /**
   * Use one curve when evaluating numbers along this Min-Max curve.
   * @param gradientX - A single curve to evaluate against on X.
   * @param gradientY - A single curve to evaluate against on Y.
   * @param gradientZ - A single curve to evaluate against on Z.
   */
  static createByGradient(
    gradientX: ParticleCurve,
    gradientY: ParticleCurve,
    gradientZ: ParticleCurve
  ): VelocityGradient {
    const gradientVelocity: VelocityGradient = new VelocityGradient();
    gradientVelocity._mode = ParticleCurveMode.Curve;
    gradientVelocity._gradientX = gradientX;
    gradientVelocity._gradientY = gradientY;
    gradientVelocity._gradientZ = gradientZ;
    return gradientVelocity;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum constants.
   * @param constantMin - The constant describing the minimum values to be evaluated.
   * @param constantMax - The constant describing the maximum values to be evaluated.
   */
  static createByRandomTwoConstant(constantMin: Vector3, constantMax: Vector3): VelocityGradient {
    const gradientVelocity: VelocityGradient = new VelocityGradient();
    gradientVelocity._mode = ParticleCurveMode.TwoConstants;
    gradientVelocity._constantMin = constantMin;
    gradientVelocity._constantMax = constantMax;
    return gradientVelocity;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum curves.
   * @param gradientXMin - The curve describing the minimum values to be evaluated on X.
   * @param gradientXMax - The curve describing the maximum values to be evaluated on X.
   * @param gradientYMin - The curve describing the minimum values to be evaluated on Y.
   * @param gradientYMax - The curve describing the maximum values to be evaluated on Y.
   * @param gradientZMin - The curve describing the minimum values to be evaluated on Z.
   * @param gradientZMax - The curve describing the maximum values to be evaluated on Z.
   */
  static createByRandomTwoGradient(
    gradientXMin: ParticleCurve,
    gradientXMax: ParticleCurve,
    gradientYMin: ParticleCurve,
    gradientYMax: ParticleCurve,
    gradientZMin: ParticleCurve,
    gradientZMax: ParticleCurve
  ): VelocityGradient {
    const gradientVelocity: VelocityGradient = new VelocityGradient();
    gradientVelocity._mode = ParticleCurveMode.TwoCurves;
    gradientVelocity._gradientXMin = gradientXMin;
    gradientVelocity._gradientXMax = gradientXMax;
    gradientVelocity._gradientYMin = gradientYMin;
    gradientVelocity._gradientYMax = gradientYMax;
    gradientVelocity._gradientZMin = gradientZMin;
    gradientVelocity._gradientZMax = gradientZMax;
    return gradientVelocity;
  }

  private _mode: ParticleCurveMode = ParticleCurveMode.Constant;
  private _constant: Vector3 = null;
  private _constantMin: Vector3 = null;
  private _constantMax: Vector3 = null;

  private _gradientX: ParticleCurve = null;
  private _gradientY: ParticleCurve = null;
  private _gradientZ: ParticleCurve = null;

  private _gradientXMin: ParticleCurve = null;
  private _gradientYMin: ParticleCurve = null;
  private _gradientZMin: ParticleCurve = null;

  private _gradientXMax: ParticleCurve = null;
  private _gradientYMax: ParticleCurve = null;
  private _gradientZMax: ParticleCurve = null;

  /**
   * The mode that the min-max curve uses to evaluate values.
   */
  get mode(): ParticleCurveMode {
    return this._mode;
  }

  /**
   * The constant value.
   */
  get constant(): Vector3 {
    return this._constant;
  }

  /**
   * The curve on X.
   */
  get gradientX(): ParticleCurve {
    return this._gradientX;
  }

  /**
   * The curve on Y.
   */
  get gradientY(): ParticleCurve {
    return this._gradientY;
  }

  /**
   * The curve on Z.
   */
  get gradientZ(): ParticleCurve {
    return this._gradientZ;
  }

  /**
   * The constant for the lower bound.
   */
  get constantMin(): Vector3 {
    return this._constantMin;
  }

  /**
   * The constant for the upper bound.
   */
  get constantMax(): Vector3 {
    return this._constantMax;
  }

  /**
   * The curve for the lower bound on X.
   */
  get gradientXMin(): ParticleCurve {
    return this._gradientXMin;
  }

  /**
   * The curve for the upper bound on X.
   */
  get gradientXMax(): ParticleCurve {
    return this._gradientXMax;
  }

  /**
   * The curve for the lower bound on Y.
   */
  get gradientYMin(): ParticleCurve {
    return this._gradientYMin;
  }

  /**
   * The curve for the upper bound on Y.
   */
  get gradientYMax(): ParticleCurve {
    return this._gradientYMax;
  }

  /**
   * The curve for the lower bound on Z.
   */
  get gradientZMin(): ParticleCurve {
    return this._gradientZMin;
  }

  /**
   * The curve for the upper bound on Z.
   */
  get gradientZMax(): ParticleCurve {
    return this._gradientZMax;
  }

  /**
   * @override
   */
  cloneTo(destGradientVelocity: VelocityGradient): void {
    destGradientVelocity._mode = this._mode;
    destGradientVelocity._constant.copyFrom(this._constant);
    this._gradientX.cloneTo(destGradientVelocity._gradientX);
    this._gradientY.cloneTo(destGradientVelocity._gradientY);
    this._gradientZ.cloneTo(destGradientVelocity._gradientZ);
    destGradientVelocity._constantMin.copyFrom(this._constantMin);
    destGradientVelocity._constantMax.copyFrom(this._constantMax);
    this._gradientXMin.cloneTo(destGradientVelocity._gradientXMin);
    this._gradientXMax.cloneTo(destGradientVelocity._gradientXMax);
    this._gradientYMin.cloneTo(destGradientVelocity._gradientYMin);
    this._gradientYMax.cloneTo(destGradientVelocity._gradientYMax);
    this._gradientZMin.cloneTo(destGradientVelocity._gradientZMin);
    this._gradientZMax.cloneTo(destGradientVelocity._gradientZMax);
  }

  /**
   * @override
   */
  clone(): VelocityGradient {
    const destGradientVelocity: VelocityGradient = new VelocityGradient();
    this.cloneTo(destGradientVelocity);
    return destGradientVelocity;
  }
}
