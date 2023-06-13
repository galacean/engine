import { ParticleCurve } from "./ParticleCurve";
import { IClone } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { ParticleCurveMode } from "../enum";

/**
 * Curve to control particle size based on lifetime
 */
export class SizeGradient implements IClone {
  /**
   * Use one curve when evaluating numbers along this Min-Max curve.
   * @param gradient - A single curve to evaluate.
   */
  static createByGradient(gradient: ParticleCurve): SizeGradient {
    const gradientSize: SizeGradient = new SizeGradient();
    gradientSize._mode = ParticleCurveMode.Curve;
    gradientSize._separateAxes = false;
    gradientSize._gradient = gradient;
    return gradientSize;
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
  ): SizeGradient {
    const gradientSize: SizeGradient = new SizeGradient();
    gradientSize._mode = ParticleCurveMode.Curve;
    gradientSize._separateAxes = true;
    gradientSize._gradientX = gradientX;
    gradientSize._gradientY = gradientY;
    gradientSize._gradientZ = gradientZ;
    return gradientSize;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum constants.
   * @param constantMin - The constant describing the minimum values to be evaluated.
   * @param constantMax - The constant describing the maximum values to be evaluated.
   */
  static createByRandomTwoConstant(constantMin: number, constantMax: number): SizeGradient {
    const gradientSize: SizeGradient = new SizeGradient();
    gradientSize._mode = ParticleCurveMode.TwoConstants;
    gradientSize._separateAxes = false;
    gradientSize._constantMin = constantMin;
    gradientSize._constantMax = constantMax;
    return gradientSize;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum constants.
   * @param constantMinSeparate - The constant describing the minimum values to be evaluated.
   * @param constantMaxSeparate - The constant describing the maximum values to be evaluated.
   */
  static createByRandomTwoConstantSeparate(constantMinSeparate: Vector3, constantMaxSeparate: Vector3): SizeGradient {
    const gradientSize: SizeGradient = new SizeGradient();
    gradientSize._mode = ParticleCurveMode.TwoConstants;
    gradientSize._separateAxes = true;
    gradientSize._constantMinSeparate = constantMinSeparate;
    gradientSize._constantMaxSeparate = constantMaxSeparate;
    return gradientSize;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum curves.
   * @param gradientMin - The curve describing the minimum values to be evaluated.
   * @param gradientMax - The curve describing the maximum values to be evaluated.
   */
  static createByRandomTwoGradient(gradientMin: ParticleCurve, gradientMax: ParticleCurve): SizeGradient {
    const gradientSize: SizeGradient = new SizeGradient();
    gradientSize._mode = ParticleCurveMode.TwoCurves;
    gradientSize._separateAxes = false;
    gradientSize._gradientMin = gradientMin;
    gradientSize._gradientMax = gradientMax;
    return gradientSize;
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
  static createByRandomTwoGradientSeparate(
    gradientXMin: ParticleCurve,
    gradientXMax: ParticleCurve,
    gradientYMin: ParticleCurve,
    gradientYMax: ParticleCurve,
    gradientZMin: ParticleCurve,
    gradientZMax: ParticleCurve
  ): SizeGradient {
    const gradientSize: SizeGradient = new SizeGradient();
    gradientSize._mode = ParticleCurveMode.TwoCurves;
    gradientSize._separateAxes = true;
    gradientSize._gradientXMin = gradientXMin;
    gradientSize._gradientXMax = gradientXMax;
    gradientSize._gradientYMin = gradientYMin;
    gradientSize._gradientYMax = gradientYMax;
    gradientSize._gradientZMin = gradientZMin;
    gradientSize._gradientZMax = gradientZMax;
    return gradientSize;
  }

  private _mode: ParticleCurveMode = ParticleCurveMode.Curve;
  private _separateAxes: boolean = false;

  private _gradient: ParticleCurve = null;
  private _gradientX: ParticleCurve = null;
  private _gradientY: ParticleCurve = null;
  private _gradientZ: ParticleCurve = null;

  private _constantMin: number = 0;
  private _constantMinSeparate: Vector3 = null;
  private _constantMax: number = 0;
  private _constantMaxSeparate: Vector3 = null;

  private _gradientMin: ParticleCurve = null;
  private _gradientXMin: ParticleCurve = null;
  private _gradientYMin: ParticleCurve = null;
  private _gradientZMin: ParticleCurve = null;

  private _gradientMax: ParticleCurve = null;
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
   * The size over lifetime on each axis separately.
   */
  get separateAxes(): boolean {
    return this._separateAxes;
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
   * The constant for the lower bound.
   */
  get constantMinSeparate(): Vector3 {
    return this._constantMinSeparate;
  }

  /**
   * The constant for the upper bound.
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
   * 获取最大尺寸。
   */
  getMaxSizeInGradient(meshMode: boolean = false): number {
    let i: number, n: number;
    let maxSize: number = -Number.MAX_VALUE;
    switch (this._mode) {
      case ParticleCurveMode.Curve:
        if (this._separateAxes) {
          for (i = 0, n = this._gradientX.gradientCount; i < n; i++)
            maxSize = Math.max(maxSize, this._gradientX.getValueByIndex(i));
          for (i = 0, n = this._gradientY.gradientCount; i < n; i++)
            maxSize = Math.max(maxSize, this._gradientY.getValueByIndex(i));
          if (meshMode) {
            for (i = 0, n = this._gradientZ.gradientCount; i < n; i++) {
              maxSize = Math.max(maxSize, this._gradientZ.getValueByIndex(i));
            }
          }
        } else {
          for (i = 0, n = this._gradient.gradientCount; i < n; i++)
            maxSize = Math.max(maxSize, this._gradient.getValueByIndex(i));
        }
        break;
      case ParticleCurveMode.TwoConstants:
        if (this._separateAxes) {
          maxSize = Math.max(this._constantMinSeparate.x, this._constantMaxSeparate.x);
          maxSize = Math.max(maxSize, this._constantMinSeparate.y);
          if (meshMode) {
            maxSize = maxSize = Math.max(maxSize, this._constantMaxSeparate.z);
          }
        } else {
          maxSize = Math.max(this._constantMin, this._constantMax);
        }
        break;
      case ParticleCurveMode.TwoCurves:
        if (this._separateAxes) {
          for (i = 0, n = this._gradientXMin.gradientCount; i < n; i++)
            maxSize = Math.max(maxSize, this._gradientXMin.getValueByIndex(i));
          for (i = 0, n = this._gradientXMax.gradientCount; i < n; i++)
            maxSize = Math.max(maxSize, this._gradientXMax.getValueByIndex(i));

          for (i = 0, n = this._gradientYMin.gradientCount; i < n; i++)
            maxSize = Math.max(maxSize, this._gradientYMin.getValueByIndex(i));
          for (i = 0, n = this._gradientZMax.gradientCount; i < n; i++)
            maxSize = Math.max(maxSize, this._gradientZMax.getValueByIndex(i));

          if (meshMode) {
            for (i = 0, n = this._gradientZMin.gradientCount; i < n; i++) {
              maxSize = Math.max(maxSize, this._gradientZMin.getValueByIndex(i));
            }
            for (i = 0, n = this._gradientZMax.gradientCount; i < n; i++) {
              maxSize = Math.max(maxSize, this._gradientZMax.getValueByIndex(i));
            }
          }
        } else {
          for (i = 0, n = this._gradientMin.gradientCount; i < n; i++)
            maxSize = Math.max(maxSize, this._gradientMin.getValueByIndex(i));
          for (i = 0, n = this._gradientMax.gradientCount; i < n; i++)
            maxSize = Math.max(maxSize, this._gradientMax.getValueByIndex(i));
        }
        break;
    }
    return maxSize;
  }

  /**
   * @override
   */
  cloneTo(destGradientSize: SizeGradient): void {
    destGradientSize._mode = this._mode;
    destGradientSize._separateAxes = this._separateAxes;
    this._gradient.cloneTo(destGradientSize._gradient);
    this._gradientX.cloneTo(destGradientSize._gradientX);
    this._gradientY.cloneTo(destGradientSize._gradientY);
    this._gradientZ.cloneTo(destGradientSize._gradientZ);
    destGradientSize._constantMin = this._constantMin;
    destGradientSize._constantMax = this._constantMax;
    destGradientSize._constantMinSeparate.copyFrom(this._constantMinSeparate);
    destGradientSize._constantMaxSeparate.copyFrom(this._constantMaxSeparate);
    this._gradientMin.cloneTo(destGradientSize._gradientMin);
    this._gradientMax.cloneTo(destGradientSize._gradientMax);
    this._gradientXMin.cloneTo(destGradientSize._gradientXMin);
    this._gradientXMax.cloneTo(destGradientSize._gradientXMax);
    this._gradientYMin.cloneTo(destGradientSize._gradientYMin);
    this._gradientYMax.cloneTo(destGradientSize._gradientYMax);
    this._gradientZMin.cloneTo(destGradientSize._gradientZMin);
    this._gradientZMax.cloneTo(destGradientSize._gradientZMax);
  }

  /**
   * @override
   */
  clone(): SizeGradient {
    const destGradientSize: SizeGradient = new SizeGradient();
    this.cloneTo(destGradientSize);
    return destGradientSize;
  }
}
