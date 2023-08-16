import { IClone } from "@galacean/engine-design";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCurve } from "./ParticleCurve";

/**
 * Particle composite curve.
 */
export class ParticleCompositeCurve implements IClone {
  /** The curve mode. */
  mode: ParticleCurveMode = ParticleCurveMode.Constant;

  private _constantMin: number = 0;
  private _constantMax: number = 0;
  private _curveMin: ParticleCurve;
  private _curveMax: ParticleCurve;

  /**
   * The constant value used by the curve if mode is set to `Constant`.
   */
  get constant(): number {
    return this._constantMax;
  }

  set constant(value: number) {
    this._constantMax = value;
  }

  /**
   * The min constant value used by the curve if mode is set to `TwoConstants`.
   */
  get constantMin(): number {
    return this._constantMin;
  }

  set constantMin(value: number) {
    this._constantMin = value;
  }

  /**
   * The max constant value used by the curve if mode is set to `TwoConstants`.
   */
  get constantMax(): number {
    return this._constantMax;
  }

  set constantMax(value: number) {
    this._constantMax = value;
  }

  /**
   * The curve used by the curve if mode is set to `Curve`.
   */
  get curve(): ParticleCurve {
    return this._curveMax;
  }

  set curve(value: ParticleCurve) {
    this._curveMax = value;
  }

  /**
   * The min curve used by the curve if mode is set to `TwoCurves`.
   */
  get curveMin(): ParticleCurve {
    return this._curveMin;
  }

  set curveMin(value: ParticleCurve) {
    this._curveMin = value;
  }

  /**
   * The max curve used by the curve if mode is set to `TwoCurves`.
   */
  get curveMax(): ParticleCurve {
    return this._curveMax;
  }

  set curveMax(value: ParticleCurve) {
    this._curveMax = value;
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

  constructor(constantOrConstantMin: number | ParticleCurve, constantMax?: number | ParticleCurve) {
    if (typeof constantOrConstantMin === "number") {
      if (constantMax) {
        this._constantMin = constantOrConstantMin;
        this._constantMax = <number>constantMax;
        this.mode = ParticleCurveMode.TwoConstants;
      } else {
        this._constantMax = constantOrConstantMin;
        this.mode = ParticleCurveMode.Constant;
      }
    } else {
      if (constantMax) {
        this._curveMin = constantOrConstantMin;
        this._curveMax = <ParticleCurve>constantMax;
        this.mode = ParticleCurveMode.TwoCurves;
      } else {
        this._curveMax = constantOrConstantMin;
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
