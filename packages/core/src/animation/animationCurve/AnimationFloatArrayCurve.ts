import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
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
      const src = srcValue[i] ?? 0;
      out[i] = src + ((destValue[i] ?? 0) - src) * weight;
    }
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Float32Array, base: Float32Array, out: Float32Array): Float32Array {
    for (let i = 0, n = src.length; i < n; i++) {
      out[i] = src[i] - (base[i] ?? 0);
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
    for (let i = 0, n = AnimationFloatArrayCurve._prepareOutput(out, source.length); i < n; ++i) {
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
   * Replace all keyframes with packed scalar arrays.
   * @param times - Keyframe timestamps in seconds
   * @param values - Packed keyframe scalars (`valueSize` per key, or `valueSize * 3` as `[inTangent, value, outTangent]`)
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
    const size = key.value.length;
    if (this._keyCount === 0 || isSingleKeyReplace) {
      if (this._valueSize !== size) {
        this._clearValues();
        this._valueSize = size;
        this._hasTangents = false;
      }
    } else if (size !== this._valueSize) {
      throw new Error(`Keyframe value length ${size} does not match curve value size ${this._valueSize}.`);
    }
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
    t: number,
    duration: number,
    out: Float32Array
  ): Float32Array {
    const values = this._values;
    const valueSize = this._valueSize;
    const stride = valueSize * 3;
    const o0 = curIndex * stride + valueSize;
    const o1 = nextIndex * stride;

    const t2 = t * t;
    const t3 = t2 * t;
    const a = 2.0 * t3 - 3.0 * t2 + 1.0;
    const b = t3 - 2.0 * t2 + t;
    const c = t3 - t2;
    const d = -2.0 * t3 + 3.0 * t2;

    const count = AnimationFloatArrayCurve._prepareOutput(out, valueSize);
    for (let i = 0; i < count; ++i) {
      const p0 = values[o0 + i];
      const t0 = values[o0 + valueSize + i];
      const t1 = values[o1 + i];
      if (Number.isFinite(t0) && Number.isFinite(t1)) {
        out[i] = a * p0 + b * t0 * duration + c * t1 * duration + d * values[o1 + valueSize + i];
      } else {
        out[i] = p0;
      }
    }
    return out;
  }

  protected override _subtractFirstKey(out: Float32Array): Float32Array {
    const values = this._values;
    const valueSize = this._valueSize;
    const offset = this._hasTangents ? valueSize : 0;
    const count = out.length < valueSize ? out.length : valueSize;
    for (let i = 0; i < count; ++i) {
      out[i] -= values[offset + i];
    }
    return out;
  }

  protected override _readKeyAt(index: number, out: Keyframe<Float32Array>): void {
    const values = this._values;
    const valueSize = this._valueSize;
    const stride = this._hasTangents ? valueSize * 3 : valueSize;
    const offset = index * stride + (this._hasTangents ? valueSize : 0);

    let dstValue = out.value;
    if (!dstValue || dstValue.length !== valueSize) {
      dstValue = out.value = new Float32Array(valueSize);
    }
    for (let i = 0; i < valueSize; i++) {
      dstValue[i] = values[offset + i];
    }

    if (this._hasTangents) {
      const inOffset = offset - valueSize;
      const outOffset = offset + valueSize;
      const inTangent = (out.inTangent ||= new Array<number>(valueSize));
      const outTangent = (out.outTangent ||= new Array<number>(valueSize));
      inTangent.length = valueSize;
      outTangent.length = valueSize;
      for (let i = 0; i < valueSize; i++) {
        inTangent[i] = values[inOffset + i];
        outTangent[i] = values[outOffset + i];
      }
    } else {
      out.inTangent = undefined;
      out.outTangent = undefined;
    }
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Float32Array>): void {
    const values = this._values;
    const valueSize = this._valueSize;
    const { value } = key;
    if (this._hasTangents) {
      const base = index * valueSize * 3;
      const valueOffset = base + valueSize;
      const outOffset = valueOffset + valueSize;
      const inTangent = key.inTangent;
      const outTangent = key.outTangent;
      for (let i = 0; i < valueSize; i++) {
        values[base + i] = inTangent ? inTangent[i] : NaN;
        values[valueOffset + i] = value[i];
        values[outOffset + i] = outTangent ? outTangent[i] : NaN;
      }
    } else {
      const base = index * valueSize;
      for (let i = 0; i < valueSize; i++) {
        values[base + i] = value[i];
      }
    }
  }
}
