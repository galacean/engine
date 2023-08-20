import { IClone } from "@galacean/engine-design";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCurve } from "./ParticleCurve";

/**
 * Particle composite curve.
 */
export class ParticleCompositeCurve implements IClone {
  /** The curve mode. */
  mode: ParticleCurveMode = ParticleCurveMode.Constant;
  /** The min constant value used by the curve if mode is set to `TwoConstants`.*/
  constantMin: number = 0;
  /** The max constant value used by the curve if mode is set to `TwoConstants`.*/
  constantMax: number = 0;
  /** The min curve used by the curve if mode is set to `TwoCurves`. */
  curveMin: ParticleCurve;
  /** The max curve used by the curve if mode is set to `TwoCurves`. */
  curveMax: ParticleCurve;

  /**
   * The constant value used by the curve if mode is set to `Constant`.
   */
  get constant(): number {
    return this.constantMax;
  }

  set constant(value: number) {
    this.constantMax = value;
  }

  /**
   * The curve used by the curve if mode is set to `Curve`.
   */
  get curve(): ParticleCurve {
    return this.curveMax;
  }

  set curve(value: ParticleCurve) {
    this.curveMax = value;
  }

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

  /**
   * Create a particle composite curve by a curve.
   * @param curve - The curve
   */
  constructor(curve: ParticleCurve);

  /**
   * Create a particle composite curve by min and max curves.
   * @param curveMin - The min curve
   * @param curveMax - The max curve
   */
  constructor(curveMin: ParticleCurve, curveMax: ParticleCurve);

  constructor(constantOrCurve: number | ParticleCurve, constantMaxOrCurveMax?: number | ParticleCurve) {
    if (typeof constantOrCurve === "number") {
      if (constantMaxOrCurveMax) {
        this.constantMin = constantOrCurve;
        this.constantMax = <number>constantMaxOrCurveMax;
        this.mode = ParticleCurveMode.TwoConstants;
      } else {
        this.constant = constantOrCurve;
        this.mode = ParticleCurveMode.Constant;
      }
    } else {
      if (constantMaxOrCurveMax) {
        this.curveMin = constantOrCurve;
        this.curveMax = <ParticleCurve>constantMaxOrCurveMax;
        this.mode = ParticleCurveMode.TwoCurves;
      } else {
        this.curve = constantOrCurve;
        this.mode = ParticleCurveMode.Curve;
      }
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
