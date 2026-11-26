import { MathUtil, Quaternion } from "@galacean/engine-math";
import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { evaluateHermiteScalar, readVec4Key, writeVec4Key } from "../internal/AnimationCurvePack";
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
  static readonly _isCopyMode = true;

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
   * Replace all keyframes with packed `Quaternion` buffers (`x, y, z, w`).
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Packed scalars (`4` per key, or `12` per key interleaved as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   * @throws Error If `values.length` does not match `times.length * 4` (`times.length * 12` when `hasTangents` is true)
   * @remarks For non-empty inputs, `times` and `values` are retained directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamps; callers must pass non-decreasing `times` and must not mutate retained buffers.
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
    a: number,
    bd: number,
    cd: number,
    d: number,
    out: Quaternion
  ): Quaternion {
    const values = this._values;
    const o0 = curIndex * 12 + 4;
    const o1 = nextIndex * 12;
    const p0x = values[o0];
    const p0y = values[o0 + 1];
    const p0z = values[o0 + 2];
    const p0w = values[o0 + 3];
    const x = evaluateHermiteScalar(p0x, values[o0 + 4], values[o1], values[o1 + 4], a, bd, cd, d);
    const y = evaluateHermiteScalar(p0y, values[o0 + 5], values[o1 + 1], values[o1 + 5], a, bd, cd, d);
    const z = evaluateHermiteScalar(p0z, values[o0 + 6], values[o1 + 2], values[o1 + 6], a, bd, cd, d);
    const w = evaluateHermiteScalar(p0w, values[o0 + 7], values[o1 + 3], values[o1 + 7], a, bd, cd, d);
    const len = Math.sqrt(x * x + y * y + z * z + w * w);
    if (len > MathUtil.zeroTolerance) {
      const invLen = 1 / len;
      return out.set(x * invLen, y * invLen, z * invLen, w * invLen);
    }
    return out.set(p0x, p0y, p0z, p0w);
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
    readVec4Key(this._values, this._hasTangents, index, out, out.value || new Quaternion());
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Quaternion>): void {
    const { value } = key;
    writeVec4Key(
      this._values,
      this._hasTangents,
      index,
      value.x,
      value.y,
      value.z,
      value.w,
      key.inTangent,
      key.outTangent
    );
  }
}
