import { ParticleCurve } from "./ParticleCurve";
import { IClone } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { ParticleGradientMode } from "../enum/ParticleGradientMode";
import { ParticleCurveMode } from "../enum";

/**
 * Rotation over lifetime curve.
 */
export class RotationVelocityGradient implements IClone {
  /**
   * A single constant value for the entire curve.
   * @param constant - Constant value.
   */
  static createByConstant(constant: number): RotationVelocityGradient {
    const gradientAngularVelocity: RotationVelocityGradient = new RotationVelocityGradient();
    gradientAngularVelocity._mode = ParticleCurveMode.Constant;
    gradientAngularVelocity._separateAxes = false;
    gradientAngularVelocity._constant = constant;
    return gradientAngularVelocity;
  }

  /**
   * A single constant value for the entire curve.
   * @param separateConstant - Constant value.
   */
  static createByConstantSeparate(separateConstant: Vector3): RotationVelocityGradient {
    const gradientAngularVelocity: RotationVelocityGradient = new RotationVelocityGradient();
    gradientAngularVelocity._mode = ParticleCurveMode.Constant;
    gradientAngularVelocity._separateAxes = true;
    gradientAngularVelocity._constantSeparate = separateConstant;
    return gradientAngularVelocity;
  }

  /**
   * Use one curve when evaluating numbers along this Min-Max curve.
   * @param gradient - A single curve to evaluate.
   */
  static createByGradient(gradient: ParticleCurve): RotationVelocityGradient {
    const gradientAngularVelocity: RotationVelocityGradient = new RotationVelocityGradient();
    gradientAngularVelocity._mode = ParticleCurveMode.Curve;
    gradientAngularVelocity._separateAxes = false;
    gradientAngularVelocity._gradient = gradient;
    return gradientAngularVelocity;
  }

  /**
   * Use one curve when evaluating numbers along this Min-Max curve.
   * @param gradientX - A single curve to evaluate against on X.
   * @param gradientY - A single curve to evaluate against on Y.
   * @param gradientZ - A single curve to evaluate against on Z.
   */
  static createByGradientSeparate(
    gradientX: ParticleCurve,
    gradientY: ParticleCurve,
    gradientZ: ParticleCurve
  ): RotationVelocityGradient {
    const gradientAngularVelocity: RotationVelocityGradient = new RotationVelocityGradient();
    gradientAngularVelocity._mode = ParticleCurveMode.Curve;
    gradientAngularVelocity._separateAxes = true;
    gradientAngularVelocity._gradientX = gradientX;
    gradientAngularVelocity._gradientY = gradientY;
    gradientAngularVelocity._gradientZ = gradientZ;
    return gradientAngularVelocity;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum constants.
   * @param constantMin - The constant describing the minimum values to be evaluated.
   * @param constantMax - The constant describing the maximum values to be evaluated.
   */
  static createByRandomTwoConstant(constantMin: number, constantMax: number): RotationVelocityGradient {
    const gradientAngularVelocity: RotationVelocityGradient = new RotationVelocityGradient();
    gradientAngularVelocity._mode = ParticleCurveMode.TwoConstants;
    gradientAngularVelocity._separateAxes = false;
    gradientAngularVelocity._constantMin = constantMin;
    gradientAngularVelocity._constantMax = constantMax;
    return gradientAngularVelocity;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum constants.
   * @param separateConstantMin - The constant describing the minimum values to be evaluated.
   * @param separateConstantMax - The constant describing the maximum values to be evaluated.
   */
  static createByRandomTwoConstantSeparate(
    separateConstantMin: Vector3,
    separateConstantMax: Vector3
  ): RotationVelocityGradient {
    const gradientAngularVelocity: RotationVelocityGradient = new RotationVelocityGradient();
    gradientAngularVelocity._mode = ParticleCurveMode.TwoConstants;
    gradientAngularVelocity._separateAxes = true;
    gradientAngularVelocity._constantMinSeparate = separateConstantMin;
    gradientAngularVelocity._constantMaxSeparate = separateConstantMax;
    return gradientAngularVelocity;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum curves.
   * @param gradientMin - The curve describing the minimum values to be evaluated on X.
   * @param gradientMax - The curve describing the maximum values to be evaluated on X.
   */
  static createByRandomTwoGradient(gradientMin: ParticleCurve, gradientMax: ParticleCurve): RotationVelocityGradient {
    const gradientAngularVelocity: RotationVelocityGradient = new RotationVelocityGradient();
    gradientAngularVelocity._mode = ParticleCurveMode.TwoCurves;
    gradientAngularVelocity._separateAxes = false;
    gradientAngularVelocity._gradientMin = gradientMin;
    gradientAngularVelocity._gradientMax = gradientMax;
    return gradientAngularVelocity;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum curves.
   * @param gradientXMin - The curve describing the minimum values to be evaluated on X.
   * @param gradientXMax - The curve describing the maximum values to be evaluated on X.
   * @param gradientYMin - The curve describing the minimum values to be evaluated on Y.
   * @param gradientYMax - The curve describing the maximum values to be evaluated on Y.
   * @param gradientZMin - The curve describing the minimum values to be evaluated on Z.
   * @param gradientZMax - The curve describing the maximum values to be evaluated on Z.
   * @param gradientWMin - The curve describing the minimum values to be evaluated on W.
   * @param gradientWMax - The curve describing the maximum values to be evaluated on W.
   */
  static createByRandomTwoGradientSeparate(
    gradientXMin: ParticleCurve,
    gradientXMax: ParticleCurve,
    gradientYMin: ParticleCurve,
    gradientYMax: ParticleCurve,
    gradientZMin: ParticleCurve,
    gradientZMax: ParticleCurve,
    gradientWMin: ParticleCurve,
    gradientWMax: ParticleCurve
  ): RotationVelocityGradient {
    const gradientAngularVelocity: RotationVelocityGradient = new RotationVelocityGradient();
    gradientAngularVelocity._mode = ParticleCurveMode.TwoCurves;
    gradientAngularVelocity._separateAxes = true;
    gradientAngularVelocity._gradientXMin = gradientXMin;
    gradientAngularVelocity._gradientXMax = gradientXMax;
    gradientAngularVelocity._gradientYMin = gradientYMin;
    gradientAngularVelocity._gradientYMax = gradientYMax;
    gradientAngularVelocity._gradientZMin = gradientZMin;
    gradientAngularVelocity._gradientZMax = gradientZMax;
    gradientAngularVelocity._gradientWMin = gradientWMin;
    gradientAngularVelocity._gradientWMax = gradientWMax;
    return gradientAngularVelocity;
  }

  private _mode: ParticleCurveMode = ParticleCurveMode.Constant;
  private _separateAxes: boolean = false;

  private _constant: number = 0;
  private _constantSeparate: Vector3 = null;
  private _constantMin: number = 0;
  private _constantMinSeparate: Vector3 = null;
  private _constantMax: number = 0;
  private _constantMaxSeparate: Vector3 = null;

  private _gradient: ParticleCurve = null;
  private _gradientX: ParticleCurve = null;
  private _gradientY: ParticleCurve = null;
  private _gradientZ: ParticleCurve = null;
  private _gradientW: ParticleCurve = null;

  private _gradientMin: ParticleCurve = null;
  private _gradientXMin: ParticleCurve = null;
  private _gradientYMin: ParticleCurve = null;
  private _gradientZMin: ParticleCurve = null;
  private _gradientWMin: ParticleCurve = null;

  private _gradientMax: ParticleCurve = null;
  private _gradientXMax: ParticleCurve = null;
  private _gradientYMax: ParticleCurve = null;
  private _gradientZMax: ParticleCurve = null;
  private _gradientWMax: ParticleCurve = null;

  /**
   * The mode that the min-max curve uses to evaluate values.
   */
  get mode(): ParticleCurveMode {
    return this._mode;
  }

  /**
   * The rotation over lifetime on each axis separately.
   */
  get separateAxes(): boolean {
    return this._separateAxes;
  }

  /**
   * The constant value.
   */
  get constant(): number {
    return this._constant;
  }

  /**
   * The constant separate value.
   */
  get constantSeparate(): Vector3 {
    return this._constantSeparate;
  }

  /**
   * The curve.
   */
  get gradient(): ParticleCurve {
    return this._gradient;
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
   * The curve on W.
   */
  get gradientW(): ParticleCurve {
    return this._gradientW;
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
   * The constant separate for the lower bound.
   */
  get constantMinSeparate(): Vector3 {
    return this._constantMinSeparate;
  }

  /**
   * The constant separate for the upper bound.
   */
  get constantMaxSeparate(): Vector3 {
    return this._constantMaxSeparate;
  }

  /**
   * The curve for the lower bound
   */
  get gradientMin(): ParticleCurve {
    return this._gradientMin;
  }

  /**
   * The curve for the upper bound
   */
  get gradientMax(): ParticleCurve {
    return this._gradientMax;
  }

  /**
   * The curve for the lower bound on X
   */
  get gradientXMin(): ParticleCurve {
    return this._gradientXMin;
  }

  /**
   * The curve for the upper bound on X
   */
  get gradientXMax(): ParticleCurve {
    return this._gradientXMax;
  }

  /**
   * The curve for the lower bound on Y
   */
  get gradientYMin(): ParticleCurve {
    return this._gradientYMin;
  }

  /**
   * The curve for the upper bound on Y
   */
  get gradientYMax(): ParticleCurve {
    return this._gradientYMax;
  }

  /**
   * The curve for the lower bound on Z
   */
  get gradientZMin(): ParticleCurve {
    return this._gradientZMin;
  }

  /**
   * The curve for the upper bound on Z
   */
  get gradientZMax(): ParticleCurve {
    return this._gradientZMax;
  }

  /**
   * The curve for the lower bound on W
   */
  get gradientWMin(): ParticleCurve {
    return this._gradientWMin;
  }

  /**
   * The curve for the upper bound on W
   */
  get gradientWMax(): ParticleCurve {
    return this._gradientWMax;
  }

  /**
   * @override
   */
  cloneTo(destGradientAngularVelocity: RotationVelocityGradient): void {
    destGradientAngularVelocity._mode = this._mode;
    destGradientAngularVelocity._separateAxes = this._separateAxes;
    destGradientAngularVelocity._constant = this._constant;
    destGradientAngularVelocity._constantSeparate.copyFrom(this._constantSeparate);
    this._gradient.cloneTo(destGradientAngularVelocity._gradient);
    this._gradientX.cloneTo(destGradientAngularVelocity._gradientX);
    this._gradientY.cloneTo(destGradientAngularVelocity._gradientY);
    this._gradientZ.cloneTo(destGradientAngularVelocity._gradientZ);
    destGradientAngularVelocity._constantMin = this._constantMin;
    destGradientAngularVelocity._constantMax = this._constantMax;
    destGradientAngularVelocity._constantMinSeparate.copyFrom(this._constantMinSeparate);
    destGradientAngularVelocity._constantMaxSeparate.copyFrom(this._constantMaxSeparate);
    this._gradientMin.cloneTo(destGradientAngularVelocity._gradientMin);
    this._gradientMax.cloneTo(destGradientAngularVelocity._gradientMax);
    this._gradientXMin.cloneTo(destGradientAngularVelocity._gradientXMin);
    this._gradientXMax.cloneTo(destGradientAngularVelocity._gradientXMax);
    this._gradientYMin.cloneTo(destGradientAngularVelocity._gradientYMin);
    this._gradientYMax.cloneTo(destGradientAngularVelocity._gradientYMax);
    this._gradientZMin.cloneTo(destGradientAngularVelocity._gradientZMin);
    this._gradientZMax.cloneTo(destGradientAngularVelocity._gradientZMax);
  }

  /**
   * @override
   */
  clone(): RotationVelocityGradient {
    const destGradientAngularVelocity: RotationVelocityGradient = new RotationVelocityGradient();
    this.cloneTo(destGradientAngularVelocity);
    return destGradientAngularVelocity;
  }
}
