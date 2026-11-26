import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { evaluateHermiteArray, readArrayKey, subtractArrayFirstKey } from "../internal/AnimationCurvePack";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<number[]>>()
export class AnimationArrayCurve extends AnimationCurve<number[]> {
  /** @internal */
  static override readonly _keyValueSize = 0;
  /** @internal */
  static readonly _isCopyMode = true;
  /** @internal */
  static readonly _supportInterpolationMode = true;

  protected declare _values: TypedArray;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<number[]>): void {
    owner.defaultValue = [];
    owner.fixedPoseValue = [];
    owner.baseEvaluateData.value = [];
    owner.crossEvaluateData.value = [];
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = [];
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: number[], destValue: number[], weight: number, out: number[]): number[] {
    for (let i = 0, n = out.length; i < n; ++i) {
      const src = srcValue[i];
      out[i] = src + (destValue[i] - src) * weight;
    }
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: number[], base: number[], out: number[]): number[] {
    for (let i = 0, n = src.length; i < n; i++) {
      out[i] = src[i] - base[i];
    }
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: number[]): number[] {
    for (let i = 0, n = out.length; i < n; i++) {
      out[i] = 0;
    }
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: number[], weight: number, out: number[]): number[] {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] += value[i] * weight;
    }
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: number[], out: number[]): number[] {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] = source[i];
    }
    return out;
  }

  constructor() {
    super();
    this._evaluateData.value = [];
  }

  protected override _evaluateKey(index: number, out: number[]): number[] {
    const values = this._values;
    const valueSize = this._valueSize;
    const offset = this._hasTangents ? index * valueSize * 3 + valueSize : index * valueSize;
    for (let i = 0; i < valueSize; ++i) {
      out[i] = values[offset + i];
    }
    out.length = valueSize;
    return out;
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: number[]): number[] {
    const values = this._values;
    const valueSize = this._valueSize;
    const stride = this._hasTangents ? valueSize * 3 : valueSize;
    const valueOffset = this._hasTangents ? valueSize : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    for (let i = 0; i < valueSize; ++i) {
      const src = values[o0 + i];
      out[i] = src + (values[o1 + i] - src) * t;
    }
    out.length = valueSize;
    return out;
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    a: number,
    bd: number,
    cd: number,
    d: number,
    out: number[]
  ): number[] {
    const valueSize = this._valueSize;
    evaluateHermiteArray(this._values, valueSize, curIndex, nextIndex, a, bd, cd, d, out, valueSize);
    out.length = valueSize;
    return out;
  }

  protected override _subtractFirstKey(out: number[]): number[] {
    return subtractArrayFirstKey(this._values, this._valueSize, this._hasTangents, out);
  }

  protected override _readKeyAt(index: number, out: Keyframe<number[]>): void {
    readArrayKey(this._values, this._valueSize, this._hasTangents, index, out, out.value || []);
  }
}
