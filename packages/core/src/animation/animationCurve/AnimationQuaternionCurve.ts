import { Quaternion, Vector4 } from "@galacean/engine-math";
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
@StaticInterfaceImplement<IAnimationCurveCalculator<Quaternion>>()
export class AnimationQuaternionCurve extends AnimationCurve<Quaternion> {
  /** @internal */
  static _supportInterpolationMode: boolean = true;
  /** @internal */
  static _isCopyMode: boolean = true;

  private static _tempConjugateQuat = new Quaternion();
  private static _tempQuat0 = new Quaternion();
  private static _tempQuat1 = new Quaternion();

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Quaternion>): void {
    owner.defaultValue = new Quaternion();
    owner.fixedPoseValue = new Quaternion();
    owner.baseEvaluateData.value = new Quaternion();
    owner.crossEvaluateData.value = new Quaternion();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Quaternion();
  }

  /**
   * @internal
   */
  static _lerpValue(src: Quaternion, dest: Quaternion, weight: number, out: Quaternion): Quaternion {
    Quaternion.slerp(src, dest, weight, out);
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Quaternion, weight: number, out: Quaternion): Quaternion {
    value.x = value.x * weight;
    value.y = value.y * weight;
    value.z = value.z * weight;

    value.normalize();
    out.multiply(value);
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Quaternion, base: Quaternion, out: Quaternion): Quaternion {
    const { _tempConjugateQuat: conjugate } = AnimationQuaternionCurve;
    Quaternion.conjugate(base, conjugate);
    Quaternion.multiply(conjugate, src, out);
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Quaternion): Quaternion {
    out.set(0, 0, 0, 1);
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: Quaternion, out: Quaternion): Quaternion {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super(4);
    this._evaluateData.value = new Quaternion();
  }

  /**
   * Replace all keyframes with packed `Quaternion` buffers.
   * @param times - Keyframe timestamps in seconds
   * @param values - Packed keyframe scalars (`4` per key, or `12` per key as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 4, hasTangents);
  }

  protected override _evaluateKey(index: number, out: Quaternion): Quaternion {
    const values = this._values;
    const offset = this._hasTangents ? index * 12 + 4 : index * 4;
    return out.set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: Quaternion): Quaternion {
    const values = this._values;
    const stride = this._hasTangents ? 12 : 4;
    const valueOffset = this._hasTangents ? 4 : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    const q0 = AnimationQuaternionCurve._tempQuat0.set(values[o0], values[o0 + 1], values[o0 + 2], values[o0 + 3]);
    const q1 = AnimationQuaternionCurve._tempQuat1.set(values[o1], values[o1 + 1], values[o1 + 2], values[o1 + 3]);
    Quaternion.slerp(q0, q1, t, out);
    return out;
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    t: number,
    duration: number,
    out: Quaternion
  ): Quaternion {
    const values = this._values;
    const o0 = curIndex * 12 + 4;
    const o1 = nextIndex * 12;

    const t2 = t * t;
    const t3 = t2 * t;
    const a = 2.0 * t3 - 3.0 * t2 + 1.0;
    const b = t3 - 2.0 * t2 + t;
    const c = t3 - t2;
    const d = -2.0 * t3 + 3.0 * t2;

    const p0x = values[o0];
    const p0y = values[o0 + 1];
    const p0z = values[o0 + 2];
    const p0w = values[o0 + 3];
    let t0 = values[o0 + 4];
    let t1 = values[o1];
    const x =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0x + b * t0 * duration + c * t1 * duration + d * values[o1 + 4]
        : p0x;

    t0 = values[o0 + 5];
    t1 = values[o1 + 1];
    const y =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0y + b * t0 * duration + c * t1 * duration + d * values[o1 + 5]
        : p0y;

    t0 = values[o0 + 6];
    t1 = values[o1 + 2];
    const z =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0z + b * t0 * duration + c * t1 * duration + d * values[o1 + 6]
        : p0z;

    t0 = values[o0 + 7];
    t1 = values[o1 + 3];
    const w =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0w + b * t0 * duration + c * t1 * duration + d * values[o1 + 7]
        : p0w;

    return out.set(x, y, z, w).normalize();
  }

  protected override _subtractFirstKey(out: Quaternion): Quaternion {
    const values = this._values;
    const offset = this._hasTangents ? 4 : 0;
    const base = AnimationQuaternionCurve._tempQuat0.set(
      values[offset],
      values[offset + 1],
      values[offset + 2],
      values[offset + 3]
    );
    return AnimationQuaternionCurve._subtractValue(out, base, out);
  }

  protected override _readKeyAt(index: number, out: Keyframe<Quaternion>): void {
    const values = this._values;
    if (this._hasTangents) {
      let offset = index * 12;
      (out.inTangent ||= new Vector4()).set(values[offset++], values[offset++], values[offset++], values[offset++]);
      (out.value ||= new Quaternion()).set(values[offset++], values[offset++], values[offset++], values[offset++]);
      (out.outTangent ||= new Vector4()).set(values[offset++], values[offset++], values[offset++], values[offset]);
    } else {
      const offset = index * 4;
      (out.value ||= new Quaternion()).set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
      out.inTangent = undefined;
      out.outTangent = undefined;
    }
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Quaternion>): void {
    const values = this._values;
    const { value } = key;
    if (this._hasTangents) {
      let offset = index * 12;
      const inTangent = key.inTangent;
      if (inTangent) {
        values[offset++] = inTangent.x;
        values[offset++] = inTangent.y;
        values[offset++] = inTangent.z;
        values[offset++] = inTangent.w;
      } else {
        values[offset++] = NaN;
        values[offset++] = NaN;
        values[offset++] = NaN;
        values[offset++] = NaN;
      }
      values[offset++] = value.x;
      values[offset++] = value.y;
      values[offset++] = value.z;
      values[offset++] = value.w;
      const outTangent = key.outTangent;
      if (outTangent) {
        values[offset++] = outTangent.x;
        values[offset++] = outTangent.y;
        values[offset++] = outTangent.z;
        values[offset] = outTangent.w;
      } else {
        values[offset++] = NaN;
        values[offset++] = NaN;
        values[offset++] = NaN;
        values[offset] = NaN;
      }
    } else {
      const offset = index * 4;
      values[offset] = value.x;
      values[offset + 1] = value.y;
      values[offset + 2] = value.z;
      values[offset + 3] = value.w;
    }
  }
}
