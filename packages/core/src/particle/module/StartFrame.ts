import { IClone } from "@oasis-engine/design";
import { ParticleCurveMode } from "../enum";

/**
 * Curve to control start frame based on lifetime.
 */
export class StartFrame implements IClone {
  /**
   * A single constant value for the entire curve.
   * @param constant - Constant value.
   */
  static createByConstant(constant: number = 0): StartFrame {
    const rotationOverLifetime = new StartFrame();
    rotationOverLifetime._mode = ParticleCurveMode.Constant;
    rotationOverLifetime._constant = constant;
    return rotationOverLifetime;
  }

  /**
   * Randomly select values based on the interval between the minimum and maximum constants.
   * @param constantMin - The constant describing the minimum values to be evaluated.
   * @param constantMax - The constant describing the maximum values to be evaluated.
   */
  static createByRandomTwoConstant(constantMin: number = 0, constantMax: number = 0): StartFrame {
    const rotationOverLifetime = new StartFrame();
    rotationOverLifetime._mode = ParticleCurveMode.TwoConstants;
    rotationOverLifetime._constantMin = constantMin;
    rotationOverLifetime._constantMax = constantMax;
    return rotationOverLifetime;
  }

  private _mode: ParticleCurveMode = ParticleCurveMode.Constant;
  private _constant: number = 0;
  private _constantMin: number = 0;
  private _constantMax: number = 0;

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
   * @override
   */
  cloneTo(destStartFrame: StartFrame): void {
    destStartFrame._mode = this._mode;
    destStartFrame._constant = this._constant;
    destStartFrame._constantMin = this._constantMin;
    destStartFrame._constantMax = this._constantMax;
  }

  /**
   * @override
   */
  clone(): StartFrame {
    const destStartFrame: StartFrame = new StartFrame();
    this.cloneTo(destStartFrame);
    return destStartFrame;
  }
}
