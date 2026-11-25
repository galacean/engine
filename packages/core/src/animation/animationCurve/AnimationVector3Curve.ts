import { Vector3 } from "@galacean/engine-math";
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
@StaticInterfaceImplement<IAnimationCurveCalculator<Vector3>>()
export class AnimationVector3Curve extends AnimationCurve<Vector3> {
  /** @internal */
  static _isCopyMode: boolean = true;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Vector3>): void {
    owner.defaultValue = new Vector3();
    owner.fixedPoseValue = new Vector3();
    owner.baseEvaluateData.value = new Vector3();
    owner.crossEvaluateData.value = new Vector3();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Vector3();
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Vector3, destValue: Vector3, weight: number, out: Vector3): Vector3 {
    Vector3.lerp(srcValue, destValue, weight, out);
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Vector3, weight: number, out: Vector3): Vector3 {
    Vector3.scale(value, weight, value);
    Vector3.add(out, value, out);
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Vector3, base: Vector3, out: Vector3): Vector3 {
    Vector3.subtract(src, base, out);
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Vector3): Vector3 {
    out.set(0, 0, 0);
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: Vector3, out: Vector3): Vector3 {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super(3);
    this._evaluateData.value = new Vector3();
  }

  /**
   * Replace all keyframes with packed `Vector3` buffers.
   * @param times - Keyframe timestamps in seconds
   * @param values - Packed keyframe scalars (`3` per key, or `9` per key as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 3, hasTangents);
  }

  protected override _evaluateKey(index: number, out: Vector3): Vector3 {
    const values = this._values;
    const offset = this._hasTangents ? index * 9 + 3 : index * 3;
    return out.set(values[offset], values[offset + 1], values[offset + 2]);
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: Vector3): Vector3 {
    const values = this._values;
    const stride = this._hasTangents ? 9 : 3;
    const valueOffset = this._hasTangents ? 3 : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    const x0 = values[o0];
    const y0 = values[o0 + 1];
    const z0 = values[o0 + 2];
    return out.set(x0 + (values[o1] - x0) * t, y0 + (values[o1 + 1] - y0) * t, z0 + (values[o1 + 2] - z0) * t);
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    t: number,
    duration: number,
    out: Vector3
  ): Vector3 {
    const values = this._values;
    const o0 = curIndex * 9 + 3;
    const o1 = nextIndex * 9;

    const t2 = t * t;
    const t3 = t2 * t;
    const a = 2.0 * t3 - 3.0 * t2 + 1.0;
    const b = t3 - 2.0 * t2 + t;
    const c = t3 - t2;
    const d = -2.0 * t3 + 3.0 * t2;

    const p0x = values[o0];
    const p0y = values[o0 + 1];
    const p0z = values[o0 + 2];
    let t0 = values[o0 + 3];
    let t1 = values[o1];
    const x =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0x + b * t0 * duration + c * t1 * duration + d * values[o1 + 3]
        : p0x;

    t0 = values[o0 + 4];
    t1 = values[o1 + 1];
    const y =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0y + b * t0 * duration + c * t1 * duration + d * values[o1 + 4]
        : p0y;

    t0 = values[o0 + 5];
    t1 = values[o1 + 2];
    const z =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0z + b * t0 * duration + c * t1 * duration + d * values[o1 + 5]
        : p0z;

    return out.set(x, y, z);
  }

  protected override _subtractFirstKey(out: Vector3): Vector3 {
    const values = this._values;
    const offset = this._hasTangents ? 3 : 0;
    return out.set(out.x - values[offset], out.y - values[offset + 1], out.z - values[offset + 2]);
  }

  protected override _readKeyAt(index: number, out: Keyframe<Vector3>): void {
    const values = this._values;
    if (this._hasTangents) {
      let offset = index * 9;
      (out.inTangent ||= new Vector3()).set(values[offset++], values[offset++], values[offset++]);
      (out.value ||= new Vector3()).set(values[offset++], values[offset++], values[offset++]);
      (out.outTangent ||= new Vector3()).set(values[offset++], values[offset++], values[offset]);
    } else {
      const offset = index * 3;
      (out.value ||= new Vector3()).set(values[offset], values[offset + 1], values[offset + 2]);
      out.inTangent = undefined;
      out.outTangent = undefined;
    }
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Vector3>): void {
    const values = this._values;
    const { value } = key;
    if (this._hasTangents) {
      let offset = index * 9;
      const inTangent = key.inTangent;
      if (inTangent) {
        values[offset++] = inTangent.x;
        values[offset++] = inTangent.y;
        values[offset++] = inTangent.z;
      } else {
        values[offset++] = NaN;
        values[offset++] = NaN;
        values[offset++] = NaN;
      }
      values[offset++] = value.x;
      values[offset++] = value.y;
      values[offset++] = value.z;
      const outTangent = key.outTangent;
      if (outTangent) {
        values[offset++] = outTangent.x;
        values[offset++] = outTangent.y;
        values[offset] = outTangent.z;
      } else {
        values[offset++] = NaN;
        values[offset++] = NaN;
        values[offset] = NaN;
      }
    } else {
      const offset = index * 3;
      values[offset] = value.x;
      values[offset + 1] = value.y;
      values[offset + 2] = value.z;
    }
  }
}
