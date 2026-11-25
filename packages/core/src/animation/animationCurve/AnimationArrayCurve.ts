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
   * Replace all keyframes with packed scalar arrays.
   * @param times - Keyframe timestamps in seconds
   * @param values - Packed keyframe scalars (`valueSize` per key, or `valueSize * 3` as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 0, hasTangents);
  }

  protected override _prepareKeyValueSize(key: Keyframe<number[]>, isSingleKeyReplace: boolean): void {
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
  }

  protected override _evaluateKey(index: number, out: number[]): number[] {
    const values = this._values;
    const valueSize = this._valueSize;
    const offset = this._hasTangents ? index * valueSize * 3 + valueSize : index * valueSize;
    out.length = valueSize;
    for (let i = 0; i < valueSize; ++i) {
      out[i] = values[offset + i];
    }
    return out;
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: number[]): number[] {
    const values = this._values;
    const valueSize = this._valueSize;
    const stride = this._hasTangents ? valueSize * 3 : valueSize;
    const valueOffset = this._hasTangents ? valueSize : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    out.length = valueSize;
    for (let i = 0; i < valueSize; ++i) {
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
    out: number[]
  ): number[] {
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

    out.length = valueSize;
    for (let i = 0; i < valueSize; ++i) {
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

  protected override _subtractFirstKey(out: number[]): number[] {
    const values = this._values;
    const valueSize = this._valueSize;
    const offset = this._hasTangents ? valueSize : 0;
    const count = out.length < valueSize ? out.length : valueSize;
    for (let i = 0; i < count; ++i) {
      out[i] -= values[offset + i];
    }
    return out;
  }

  protected override _readKeyAt(index: number, out: Keyframe<number[]>): void {
    const values = this._values;
    const valueSize = this._valueSize;
    const stride = this._hasTangents ? valueSize * 3 : valueSize;
    const offset = index * stride + (this._hasTangents ? valueSize : 0);

    const dstValue = (out.value ||= new Array<number>(valueSize));
    dstValue.length = valueSize;
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

  protected override _writeKeyAt(index: number, key: Keyframe<number[]>): void {
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
