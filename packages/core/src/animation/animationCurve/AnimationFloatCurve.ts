import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { evaluateHermiteScalar } from "../internal/AnimationCurvePack";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<number>>()
export class AnimationFloatCurve extends AnimationCurve<number> {
  /** @internal */
  static _isCopyMode: boolean = false;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

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
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = 0;
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

  /**
   * @internal
   */
  static _setValue(source: number): number {
    return source;
  }

  constructor() {
    super(1);
    this._evaluateData.value = 0;
  }

  /**
   * Replace all keyframes with packed scalar arrays.
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Packed scalars (`1` per key, or `3` per key as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   * @throws Error If `values.length` does not match `times.length` and the expected stride
   * @remarks Non-empty inputs retain `times` and `values` directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamp order; callers must pass non-decreasing `times` and must not mutate retained buffers.
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 1, hasTangents);
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

  protected override _readKeyAt(index: number, out: Keyframe<number>): void {
    const values = this._values;
    if (this._hasTangents) {
      const offset = index * 3;
      out.inTangent = values[offset];
      out.value = values[offset + 1];
      out.outTangent = values[offset + 2];
    } else {
      out.value = values[index];
      out.inTangent = undefined;
      out.outTangent = undefined;
    }
  }

  protected override _writeKeyAt(index: number, key: Keyframe<number>): void {
    const values = this._values;
    if (this._hasTangents) {
      const offset = index * 3;
      values[offset] = key.inTangent ?? NaN;
      values[offset + 1] = key.value;
      values[offset + 2] = key.outTangent ?? NaN;
    } else {
      values[index] = key.value;
    }
  }
}
