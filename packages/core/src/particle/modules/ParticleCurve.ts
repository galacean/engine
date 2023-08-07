import { IClone } from "@galacean/engine-design";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";

/**
 * Particle curve.
 */
export class ParticleCurve implements IClone {
  /** The curve mode. */
  mode: ParticleCurveMode = ParticleCurveMode.Constant;
  /* The constant value used by the curve if mode is set to `Constant`. */
  constant: number = 0;
  /* The min constant value used by the curve if mode is set to `TwoConstants`. */
  constantMin: number = 0;
  /* The max constant value used by the curve if mode is set to`TwoConstants`. */
  constantMax: number = 0;

  /**
   * Query the curve value at the specified time.
   * @param time - Normalized time at which to evaluate the curve, Valid when `mode` is set to `Curve` or `TwoCurves`
   * @param lerpFactor - Lerp factor between two constants or curves, Valid when `mode` is set to `TwoConstants` or `TwoCurves`
   * @returns - The result curve value
   */

  evaluate(time: number, lerpFactor: number): number {
    switch (this.mode) {
      case ParticleCurveMode.Constant:
        return this.constant;
      case ParticleCurveMode.TwoConstants:
        return this.constantMin + (this.constantMax - this.constantMin) * lerpFactor;
      default:
        break;
    }
  }

  /**
   * @inheritDoc
   */
  cloneTo(destEmission: ParticleCurve): void {
    destEmission.mode = this.mode;
    destEmission.constant = this.constant;
    destEmission.constantMin = this.constantMin;
    destEmission.constantMax = this.constantMax;
  }

  /**
   * @inheritDoc
   */
  clone(): ParticleCurve {
    const destEmission = new ParticleCurve();
    this.cloneTo(destEmission);
    return destEmission;
  }
}
