import { Vector4 } from "@galacean/engine-math";
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
@StaticInterfaceImplement<IAnimationCurveCalculator<Vector4>>()
export class AnimationVector4Curve extends AnimationCurve<Vector4> {
  /** @internal */
  static _isCopyMode: boolean = true;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Vector4>): void {
    owner.defaultValue = new Vector4();
    owner.fixedPoseValue = new Vector4();
    owner.baseEvaluateData.value = new Vector4();
    owner.crossEvaluateData.value = new Vector4();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Vector4();
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Vector4, destValue: Vector4, weight: number, out: Vector4): Vector4 {
    Vector4.lerp(srcValue, destValue, weight, out);
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Vector4, weight: number, out: Vector4): Vector4 {
    Vector4.scale(value, weight, value);
    Vector4.add(out, value, out);
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Vector4, base: Vector4, out: Vector4): Vector4 {
    Vector4.subtract(src, base, out);
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Vector4): Vector4 {
    out.set(0, 0, 0, 0);
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: Vector4, out: Vector4): Vector4 {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super(4);
    this._evaluateData.value = new Vector4();
  }

  /**
   * Replace all keyframes with packed `Vector4` buffers.
   * @param times - Keyframe timestamps in seconds
   * @param values - Packed keyframe scalars (`4` per key, or `12` per key as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 4, hasTangents);
  }

  protected override _evaluateKey(index: number, out: Vector4): Vector4 {
    const values = this._values;
    const offset = this._hasTangents ? index * 12 + 4 : index * 4;
    return out.set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: Vector4): Vector4 {
    const values = this._values;
    const stride = this._hasTangents ? 12 : 4;
    const valueOffset = this._hasTangents ? 4 : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    const x0 = values[o0];
    const y0 = values[o0 + 1];
    const z0 = values[o0 + 2];
    const w0 = values[o0 + 3];
    return out.set(
      x0 + (values[o1] - x0) * t,
      y0 + (values[o1 + 1] - y0) * t,
      z0 + (values[o1 + 2] - z0) * t,
      w0 + (values[o1 + 3] - w0) * t
    );
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    t: number,
    duration: number,
    out: Vector4
  ): Vector4 {
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

    return out.set(x, y, z, w);
  }

  protected override _subtractFirstKey(out: Vector4): Vector4 {
    const values = this._values;
    const offset = this._hasTangents ? 4 : 0;
    return out.set(
      out.x - values[offset],
      out.y - values[offset + 1],
      out.z - values[offset + 2],
      out.w - values[offset + 3]
    );
  }

  protected override _readKeyAt(index: number, out: Keyframe<Vector4>): void {
    const values = this._values;
    if (this._hasTangents) {
      let offset = index * 12;
      (out.inTangent ||= new Vector4()).set(values[offset++], values[offset++], values[offset++], values[offset++]);
      (out.value ||= new Vector4()).set(values[offset++], values[offset++], values[offset++], values[offset++]);
      (out.outTangent ||= new Vector4()).set(values[offset++], values[offset++], values[offset++], values[offset]);
    } else {
      const offset = index * 4;
      (out.value ||= new Vector4()).set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
      out.inTangent = undefined;
      out.outTangent = undefined;
    }
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Vector4>): void {
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
