import { Vector2 } from "@galacean/engine-math";
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
@StaticInterfaceImplement<IAnimationCurveCalculator<Vector2>>()
export class AnimationVector2Curve extends AnimationCurve<Vector2> {
  /** @internal */
  static _isCopyMode: boolean = true;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Vector2>): void {
    owner.defaultValue = new Vector2();
    owner.fixedPoseValue = new Vector2();
    owner.baseEvaluateData.value = new Vector2();
    owner.crossEvaluateData.value = new Vector2();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Vector2();
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Vector2, destValue: Vector2, weight: number, out: Vector2): Vector2 {
    Vector2.lerp(srcValue, destValue, weight, out);
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Vector2, weight: number, out: Vector2): Vector2 {
    Vector2.scale(value, weight, value);
    Vector2.add(out, value, out);
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Vector2, base: Vector2, out: Vector2): Vector2 {
    Vector2.subtract(src, base, out);
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Vector2): Vector2 {
    out.set(0, 0);
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: Vector2, out: Vector2): Vector2 {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super(2);
    this._evaluateData.value = new Vector2();
  }

  /**
   * Replace all keyframes with packed `Vector2` buffers.
   * @param times - Keyframe timestamps in seconds
   * @param values - Packed keyframe scalars (`2` per key, or `6` per key as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 2, hasTangents);
  }

  protected override _evaluateKey(index: number, out: Vector2): Vector2 {
    const values = this._values;
    const offset = this._hasTangents ? index * 6 + 2 : index * 2;
    return out.set(values[offset], values[offset + 1]);
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: Vector2): Vector2 {
    const values = this._values;
    const stride = this._hasTangents ? 6 : 2;
    const valueOffset = this._hasTangents ? 2 : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    const x0 = values[o0];
    const y0 = values[o0 + 1];
    return out.set(x0 + (values[o1] - x0) * t, y0 + (values[o1 + 1] - y0) * t);
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    t: number,
    duration: number,
    out: Vector2
  ): Vector2 {
    const values = this._values;
    const o0 = curIndex * 6 + 2;
    const o1 = nextIndex * 6;

    const t2 = t * t;
    const t3 = t2 * t;
    const a = 2.0 * t3 - 3.0 * t2 + 1.0;
    const b = t3 - 2.0 * t2 + t;
    const c = t3 - t2;
    const d = -2.0 * t3 + 3.0 * t2;

    const p0x = values[o0];
    const p0y = values[o0 + 1];
    let t0 = values[o0 + 2];
    let t1 = values[o1];
    const x =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0x + b * t0 * duration + c * t1 * duration + d * values[o1 + 2]
        : p0x;

    t0 = values[o0 + 3];
    t1 = values[o1 + 1];
    const y =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0y + b * t0 * duration + c * t1 * duration + d * values[o1 + 3]
        : p0y;

    return out.set(x, y);
  }

  protected override _subtractFirstKey(out: Vector2): Vector2 {
    const values = this._values;
    const offset = this._hasTangents ? 2 : 0;
    return out.set(out.x - values[offset], out.y - values[offset + 1]);
  }

  protected override _readKeyAt(index: number, out: Keyframe<Vector2>): void {
    const values = this._values;
    if (this._hasTangents) {
      let offset = index * 6;
      (out.inTangent ||= new Vector2()).set(values[offset++], values[offset++]);
      (out.value ||= new Vector2()).set(values[offset++], values[offset++]);
      (out.outTangent ||= new Vector2()).set(values[offset++], values[offset]);
    } else {
      const offset = index * 2;
      (out.value ||= new Vector2()).set(values[offset], values[offset + 1]);
      out.inTangent = undefined;
      out.outTangent = undefined;
    }
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Vector2>): void {
    const values = this._values;
    const { value } = key;
    if (this._hasTangents) {
      let offset = index * 6;
      const inTangent = key.inTangent;
      if (inTangent) {
        values[offset++] = inTangent.x;
        values[offset++] = inTangent.y;
      } else {
        values[offset++] = NaN;
        values[offset++] = NaN;
      }
      values[offset++] = value.x;
      values[offset++] = value.y;
      const outTangent = key.outTangent;
      if (outTangent) {
        values[offset++] = outTangent.x;
        values[offset] = outTangent.y;
      } else {
        values[offset++] = NaN;
        values[offset] = NaN;
      }
    } else {
      const offset = index * 2;
      values[offset] = value.x;
      values[offset + 1] = value.y;
    }
  }
}
