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
@StaticInterfaceImplement<IAnimationCurveCalculator<Float32Array>>()
export class AnimationFloatArrayCurve extends AnimationCurve<Float32Array> {
  /** @internal */
  static _isCopyMode: boolean = true;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Float32Array>): void {
    const size = owner.referenceTargetValue.length;
    owner.defaultValue = new Float32Array(size);
    owner.fixedPoseValue = new Float32Array(size);
    owner.baseEvaluateData.value = new Float32Array(size);
    owner.crossEvaluateData.value = new Float32Array(size);
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    const size = (<Float32Array>owner.curveOwner.referenceTargetValue).length;
    owner.finalValue = new Float32Array(size);
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Float32Array, destValue: Float32Array, weight: number, out: Float32Array): Float32Array {
    for (let i = 0, n = out.length; i < n; ++i) {
      const src = srcValue[i];
      out[i] = src + (destValue[i] - src) * weight;
    }
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Float32Array, base: Float32Array, out: Float32Array): Float32Array {
    for (let i = 0, n = src.length; i < n; i++) {
      out[i] = src[i] - base[i];
    }
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Float32Array): Float32Array {
    for (let i = 0, n = out.length; i < n; i++) {
      out[i] = 0;
    }
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Float32Array, weight: number, out: Float32Array): Float32Array {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] += value[i] * weight;
    }
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: Float32Array, out: Float32Array): Float32Array {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] = source[i];
    }
    return out;
  }

  /** A remapped track contributes zero to morph targets absent from its source. */
  private static _prepareOutput(out: Float32Array, sourceSize: number): number {
    if (out.length <= sourceSize) return out.length;
    out.fill(0, sourceSize);
    return sourceSize;
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
    if (this._evaluateData.value && this._evaluateData.value.length !== this._valueSize) {
      this._evaluateData.value = null!;
    }
  }

  /** @inheritdoc */
  override evaluate(time: number): Float32Array | undefined {
    if (this._keyCount > 0 && (!this._evaluateData.value || this._evaluateData.value.length !== this._valueSize)) {
      this._evaluateData.value = new Float32Array(this._valueSize);
    }
    return super.evaluate(time);
  }

  protected override _prepareKeyValueSize(key: Keyframe<Float32Array>, isSingleKeyReplace: boolean): void {
    this._prepareVariableValueSize(key.value.length, isSingleKeyReplace);
  }

  protected override _clearValues(): void {
    super._clearValues();
    this._valueSize = 0;
    this._evaluateData.value = null!;
  }

  protected override _evaluateKey(index: number, out: Float32Array): Float32Array {
    const values = this._values;
    const valueSize = this._valueSize;
    const offset = this._hasTangents ? index * valueSize * 3 + valueSize : index * valueSize;
    const count = AnimationFloatArrayCurve._prepareOutput(out, valueSize);
    for (let i = 0; i < count; ++i) {
      out[i] = values[offset + i];
    }
    return out;
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: Float32Array): Float32Array {
    const values = this._values;
    const valueSize = this._valueSize;
    const stride = this._hasTangents ? valueSize * 3 : valueSize;
    const valueOffset = this._hasTangents ? valueSize : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    const count = AnimationFloatArrayCurve._prepareOutput(out, valueSize);
    for (let i = 0; i < count; ++i) {
      const src = values[o0 + i];
      out[i] = src + (values[o1 + i] - src) * t;
    }
    return out;
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    a: number,
    bd: number,
    cd: number,
    d: number,
    out: Float32Array
  ): Float32Array {
    const valueSize = this._valueSize;
    const count = AnimationFloatArrayCurve._prepareOutput(out, valueSize);
    evaluateHermiteArray(this._values, valueSize, curIndex, nextIndex, a, bd, cd, d, out, count);
    return out;
  }

  protected override _subtractFirstKey(out: Float32Array): Float32Array {
    return subtractArrayFirstKey(this._values, this._valueSize, this._hasTangents, out);
  }

  protected override _readKeyAt(index: number, out: Keyframe<Float32Array>): void {
    const valueSize = this._valueSize;
    const dstValue = out.value && out.value.length === valueSize ? out.value : new Float32Array(valueSize);
    readArrayKey(this._values, valueSize, this._hasTangents, index, out, dstValue);
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Float32Array>): void {
    writeArrayKey(this._values, this._valueSize, this._hasTangents, index, key);
  }
}
