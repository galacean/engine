import { IClone } from "@galacean/engine-design";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCurve } from "./ParticleCurve";

/**
 * Particle composite curve.
 */
export class ParticleCompositeCurve implements IClone {
  /** The curve mode. */
  mode: ParticleCurveMode = ParticleCurveMode.Constant;
  /* The constant value used by the curve if mode is set to `Constant`. */
  constant: number = 0;
  /* The min constant value used by the curve if mode is set to `TwoConstants`. */
  constantMin: number = 0;
  /* The max constant value used by the curve if mode is set to`TwoConstants`. */
  constantMax: number = 0;

  /* The constant value used by the curve if mode is set to `Constant`. */
  curve: ParticleCurve = new ParticleCurve();
  /* The min constant value used by the curve if mode is set to `TwoConstants`. */
  curveMin: ParticleCurve = new ParticleCurve();
  /* The max constant value used by the curve if mode is set to`TwoConstants`. */
  curveMax: ParticleCurve = new ParticleCurve();

  /**
   * Create a particle curve that generates a constant value.
   * @param constant - The constant value
   */
  constructor(constant: number);

  /**
   * Create a particle curve that can generate values between a minimum constant and a maximum constant.
   * @param constantMin - The min constant value
   * @param constantMax - The max constant value
   */
  constructor(constantMin: number, constantMax: number);

  constructor(constantOrConstantMin: number, constantMax?: number) {
    if (constantMax) {
      this.constantMin = constantOrConstantMin;
      this.constantMax = constantMax;
      this.mode = ParticleCurveMode.TwoConstants;
    } else {
      this.constant = constantOrConstantMin;
      this.mode = ParticleCurveMode.Constant;
    }
  }

  /**
   * Query the value at the specified time.
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
  cloneTo(destEmission: ParticleCompositeCurve): void {
    destEmission.mode = this.mode;
    destEmission.constant = this.constant;
    destEmission.constantMin = this.constantMin;
    destEmission.constantMax = this.constantMax;
  }

  /**
   * @inheritDoc
   */
  clone(): ParticleCompositeCurve {
    let destCurve = new ParticleCompositeCurve(0);
    this.cloneTo(destCurve);
    return destCurve;
  }
}
