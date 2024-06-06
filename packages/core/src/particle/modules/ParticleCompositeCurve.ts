import { Vector2 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { CurveKey, ParticleCurve } from "./ParticleCurve";
import { UpdateFlagManager } from "../../UpdateFlagManager";

/**
 * Particle composite curve.
 */
export class ParticleCompositeCurve {
  @ignoreClone
  private _updateManager = new UpdateFlagManager();
  private _mode = ParticleCurveMode.Constant;
  private _constantMin: number = 0;
  private _constantMax: number = 0;
  @deepClone
  private _curveMin: ParticleCurve;
  @deepClone
  private _curveMax: ParticleCurve;
  @ignoreClone
  private _updateDispatch: () => void;

  /**
   * The curve mode.
   */
  get mode(): ParticleCurveMode {
    return this._mode;
  }
  set mode(value: ParticleCurveMode) {
    if (value !== this._mode) {
      this._mode = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * The min constant value used by the curve if mode is set to `TwoConstants`.
   */
  get constantMin(): number {
    return this._constantMin;
  }

  set constantMin(value: number) {
    if (value !== this._constantMin) {
      this._constantMin = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * The max constant value used by the curve if mode is set to `TwoConstants`.
   */
  get constantMax(): number {
    return this._constantMax;
  }

  set constantMax(value: number) {
    if (value !== this._constantMax) {
      this._constantMax = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * The min curve used by the curve if mode is set to `TwoCurves`.
   */
  get curveMin(): ParticleCurve {
    return this._curveMin;
  }

  set curveMin(value: ParticleCurve) {
    const lastCurve = this._curveMin;
    if (value !== lastCurve) {
      this._curveMin = value;
      this._onCurveChange(lastCurve, value);
    }
  }

  /**
   * The max curve used by the curve if mode is set to `TwoCurves`.
   */
  get curveMax(): ParticleCurve {
    return this._curveMax;
  }

  set curveMax(value: ParticleCurve) {
    const lastCurve = this._curveMax;
    if (value !== lastCurve) {
      this._curveMax = value;
      this._onCurveChange(lastCurve, value);
    }
  }

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
    this._updateDispatch = this._updateManager.dispatch.bind(this._updateManager);
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
   */
  _getMax(): number {
    switch (this.mode) {
      case ParticleCurveMode.Constant:
        return this.constantMax;

      case ParticleCurveMode.TwoConstants:
        return Math.max(this.constantMin, this.constantMax);

      case ParticleCurveMode.Curve: {
        return this._getMaxKeyValue(this.curveMax?.keys);
      }

      case ParticleCurveMode.TwoCurves: {
        const min = this._getMaxKeyValue(this.curveMin?.keys);
        const max = this._getMaxKeyValue(this.curveMax?.keys);

        return min > max ? min : max;
      }
    }
  }

  /**
   * @internal

   */
  _getMinMax(out: Vector2): void {
    switch (this.mode) {
      case ParticleCurveMode.Constant: {
        out.x = out.y = this.constantMax;
        break;
      }
      case ParticleCurveMode.TwoConstants:
        out.set(Math.min(this.constantMin, this.constantMax), Math.max(this.constantMin, this.constantMax));
        break;

      case ParticleCurveMode.Curve:
        out.set(this._getMinKeyValue(this.curveMax?.keys), this._getMaxKeyValue(this.curveMax?.keys));
        break;

      case ParticleCurveMode.TwoCurves:
        const minCurveMax = this._getMinKeyValue(this.curveMax?.keys);
        const minCurveMin = this._getMinKeyValue(this.curveMin?.keys);

        const maxCurveMax = this._getMaxKeyValue(this.curveMax?.keys);
        const maxCurveMin = this._getMaxKeyValue(this.curveMin?.keys);

        const min = minCurveMax < minCurveMin ? minCurveMax : minCurveMin;
        const max = maxCurveMax > maxCurveMin ? maxCurveMax : maxCurveMin;

        out.set(min, max);
        break;
    }
  }

  /**
   * @internal
   */
  _registerOnValueChanged(listener: () => void): void {
    this._updateManager.addListener(listener);
  }

  /**
   * @internal
   */
  _unRegisterOnValueChanged(listener: () => void): void {
    this._updateManager.removeListener(listener);
  }

  private _getMaxKeyValue(keys: ReadonlyArray<CurveKey>): number {
    let max = undefined;
    const count = keys?.length ?? 0;
    if (count > 0) {
      max = keys[0].value;
      for (let i = 1; i < count; i++) {
        const value = keys[i].value;
        max = Math.max(max, value);
      }
    }
    return max;
  }

  private _getMinKeyValue(keys: ReadonlyArray<CurveKey>): number {
    let min = undefined;
    const count = keys?.length ?? 0;
    if (count > 0) {
      min = keys[0].value;
      for (let i = 1; i < count; i++) {
        const value = keys[i].value;
        min = Math.min(min, value);
      }
    }
    return min;
  }

  private _onCurveChange(lastValue: ParticleCurve, value: ParticleCurve) {
    const dispatch = this._updateDispatch;
    lastValue?._unRegisterOnValueChanged(dispatch);
    value._registerOnValueChanged(dispatch);
    dispatch();
  }
}
