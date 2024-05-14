import { Vector2 } from "@galacean/engine-math";
import { deepClone } from "../../clone/CloneManager";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCurve } from "./ParticleCurve";

/**
 * Particle composite curve.
 */
export class ParticleCompositeCurve {
  private _mode = ParticleCurveMode.Constant;
  private _constantMin: number = 0;
  private _constantMax: number = 0;
  @deepClone
  _curveMin: ParticleCurve;
  @deepClone
  _curveMax: ParticleCurve;

  /** The curve mode. */
  get mode(): ParticleCurveMode {
    return this._mode;
  }
  set mode(value: ParticleCurveMode) {
    this._mode = value;
    this._onValueChanged && this._onValueChanged();
  }

  /** The min constant value used by the curve if mode is set to `TwoConstants`. */
  get constantMin(): number {
    return this._constantMin;
  }

  set constantMin(value: number) {
    this._constantMin = value;
    this._onValueChanged && this._onValueChanged();
  }

  /** The max constant value used by the curve if mode is set to `TwoConstants`. */
  get constantMax(): number {
    return this._constantMax;
  }

  set constantMax(value: number) {
    this._constantMax = value;
    this._onValueChanged && this._onValueChanged();
  }

  /** The min curve used by the curve if mode is set to `TwoCurves`. */
  get curveMin(): ParticleCurve {
    return this._curveMin;
  }

  set curveMin(value: ParticleCurve) {
    this._curveMin = value;
    this._curveMin._onValueChanged = this._onValueChanged;
    this._onValueChanged && this._onValueChanged();
  }

  /** The max curve used by the curve if mode is set to `TwoCurves`. */
  get curveMax(): ParticleCurve {
    return this._curveMax;
  }

  set curveMax(value: ParticleCurve) {
    this._curveMax = value;
    this._curveMax._onValueChanged = this._onValueChanged;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The constant value used by the curve if mode is set to `Constant`.
   */
  get constant(): number {
    return this.constantMax;
  }

  set constant(value: number) {
    this.constantMax = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The curve used by the curve if mode is set to `Curve`.
   */
  get curve(): ParticleCurve {
    return this.curveMax;
  }

  set curve(value: ParticleCurve) {
    this.curveMax = value;
    this._curveMax._onValueChanged = this._onValueChanged;
    this._onValueChanged && this._onValueChanged();
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
   * @internal
   * @param out - x as the max negative value, y as the max positive value of the curve.
   */
  _getExtremeNegativeAndPositiveValuesFromZero(out: Vector2): void {
    out.x = out.y = 0;
    switch (this.mode) {
      case ParticleCurveMode.Constant:
        out.x = Math.min(0, this.constantMax);
        out.y = Math.max(0, this.constantMax);
        break;
      case ParticleCurveMode.TwoConstants:
        out.x = Math.min(0, this.constantMin, this.constantMax);
        out.y = Math.max(0, this.constantMin, this.constantMax);
        break;
      case ParticleCurveMode.Curve:
        for (let i = 0; i < this.curveMax?.keys.length; i++) {
          out.x = Math.min(out.x, this.curveMax.keys[i].value);
          out.y = Math.max(out.y, this.curveMax.keys[i].value);
        }
        break;
      case ParticleCurveMode.TwoCurves:
        for (let i = 0; i < this.curveMax?.keys.length; i++) {
          out.x = Math.min(out.x, this.curveMax.keys[i].value);
          out.y = Math.max(out.y, this.curveMax.keys[i].value);
        }
        for (let i = 0; i < this.curveMin?.keys.length; i++) {
          out.x = Math.min(out.x, this.curveMin.keys[i].value);
          out.y = Math.max(out.y, this.curveMin.keys[i].value);
        }
        break;
    }
  }
  /** @internal */
  _onValueChanged: () => void = null;
}
