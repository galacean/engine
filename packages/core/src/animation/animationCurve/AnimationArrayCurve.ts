import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import {
  evaluateHermiteArray,
  readArrayKey,
  subtractArrayFirstKey,
  writeArrayKey
} from "../internal/AnimationCurvePack";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<number[]>>()
export class AnimationArrayCurve extends AnimationCurve<number[]> {
  /** @internal */
  static _isCopyMode: boolean = true;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

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
    super(0);
    this._evaluateData.value = [];
  }

  /**
   * Replace all keyframes with packed scalar arrays; per-key element width is inferred from `values.length` and `times.length`.
   * When `times` is already ascending, `times` and `values` are retained by reference without copying (copy-on-write on mutation) and must not be mutated by the caller; unsorted inputs or later edits copy `values` into `Float32Array`.
   * @param times - Keyframe timestamps in seconds
   * @param values - Packed keyframe scalars (`width` per key, or `width * 3` as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 0, hasTangents);
  }

  protected override _prepareKeyValueSize(key: Keyframe<number[]>, isSingleKeyReplace: boolean): void {
    this._prepareVariableValueSize(key.value.length, isSingleKeyReplace);
  }

  protected override _clearValues(): void {
    super._clearValues();
    this._valueSize = 0;
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

  protected override _writeKeyAt(index: number, key: Keyframe<number[]>): void {
    writeArrayKey(this._values, this._valueSize, this._hasTangents, index, key);
  }
}
