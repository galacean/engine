import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { evaluateHermiteScalar } from "../internal/AnimationCurvePack";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<number>>()
export class AnimationFloatCurve extends AnimationCurve<number> {
  /** @internal */
  static override readonly _keyValueSize = 1;
  /** @internal */
  static readonly _isCopyMode = false;
  /** @internal */
  static readonly _supportInterpolationMode = true;

  protected declare _values: TypedArray;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<number>): void {
    owner.defaultValue = 0;
    owner.fixedPoseValue = 0;
    owner.baseEvaluateData.value = 0;
    owner.crossEvaluateData.value = 0;
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: number, destValue: number, crossWeight: number): number {
    return srcValue + (destValue - srcValue) * crossWeight;
  }

  /**
   * @internal
   */
  static _additiveValue(value: number, weight: number, source: number): number {
    return (source += value * weight);
  }

  /**
   * @internal
   */
  static _subtractValue(src: number, base: number): number {
    return src - base;
  }

  /**
   * @internal
   */
  static _getZeroValue(): number {
    return 0;
  }

  constructor() {
    super();
    this._evaluateData.value = 0;
  }

  protected override _evaluateKey(index: number): number {
    return this._values[this._hasTangents ? index * 3 + 1 : index];
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number): number {
    const values = this._values;
    const stride = this._hasTangents ? 3 : 1;
    const valueOffset = this._hasTangents ? 1 : 0;
    const p0 = values[curIndex * stride + valueOffset];
    return p0 + (values[nextIndex * stride + valueOffset] - p0) * t;
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    a: number,
    bd: number,
    cd: number,
    d: number
  ): number {
    const values = this._values;
    const o0 = curIndex * 3 + 1;
    const o1 = nextIndex * 3;
    return evaluateHermiteScalar(values[o0], values[o0 + 1], values[o1], values[o1 + 1], a, bd, cd, d);
  }

  protected override _subtractFirstKey(out: number): number {
    return out - this._values[this._hasTangents ? 1 : 0];
  }
}
