import { Vector4 } from "@oasis-engine/math";
import { StaticInterfaceImplement } from "../../2d/assembler/StaticInterfaceImplement";
import { InterpolableValueType } from "../enums/InterpolableValueType";
import { AnimationCurveOwner } from "../internal/AnimationCurveOwner";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveStatic } from "./IAnimationCurveStatic";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveStatic<Vector4>>()
export class AnimationVector4Curve extends AnimationCurve<Vector4, Vector4> {
  /**
   * @internal
   */
  static _lerpValue(srcValue: Vector4, destValue: Vector4, crossWeight: number, out: Vector4): Vector4 {
    Vector4.lerp(srcValue, destValue, crossWeight, out);
    return out;
  }

  static _additiveValue(value: Vector4, weight: number, out: Vector4): void {
    out.x += value.x * weight;
    out.y += value.y * weight;
    out.z += value.z * weight;
    out.w += value.w * weight;
  }

  static _copyFrom(scource: Vector4, out: Vector4): void {
    out.copyFrom(scource);
  }

  constructor() {
    super();
    this._type = InterpolableValueType.Vector4;
  }

  /**
   * @internal
   */
  _initializeOwner(owner: AnimationCurveOwner<Vector4, Vector4>): void {
    owner._defaultValue = new Vector4();
    owner._fixedPoseValue = new Vector4();
    owner._baseTempValue = new Vector4();
    owner._crossTempValue = new Vector4();
  }

  /**
   * @internal
   */
  _evaluateAdditive(time: number, out?: Vector4): Vector4 {
    const baseValue = this.keys[0].value;
    this._evaluate(time, out);
    Vector4.subtract(out, baseValue, out);
    return out;
  }

  protected _evaluateLinear(frameIndex: number, nextFrameIndex: number, t: number, out: Vector4): Vector4 {
    const { keys } = this;
    Vector4.lerp(keys[frameIndex].value, keys[nextFrameIndex].value, t, out);
    return out;
  }

  protected _evaluateStep(frameIndex: number, out: Vector4): Vector4 {
    out.copyFrom(this.keys[frameIndex].value);
    return out;
  }

  protected _evaluateHermite(
    frameIndex: number,
    nextFrameIndex: number,
    t: number,
    dur: number,
    out: Vector4
  ): Vector4 {
    const { keys } = this;
    const curKey = keys[frameIndex];
    const nextKey = keys[nextFrameIndex];
    const p0 = curKey.value;
    const tan0 = curKey.outTangent;
    const p1 = nextKey.value;
    const tan1 = nextKey.inTangent;

    const t2 = t * t;
    const t3 = t2 * t;
    const a = 2.0 * t3 - 3.0 * t2 + 1.0;
    const b = t3 - 2.0 * t2 + t;
    const c = t3 - t2;
    const d = -2.0 * t3 + 3.0 * t2;

    let t0 = tan0.x,
      t1 = tan1.x;
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
    } else {
      out.x = p0.x;
    }

    (t0 = tan0.y), (t1 = tan1.y);
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
    } else {
      out.y = p0.y;
    }

    (t0 = tan0.z), (t1 = tan1.z);
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.z = a * p0.z + b * t0 * dur + c * t1 * dur + d * p1.z;
    } else {
      out.z = p0.z;
    }

    (t0 = tan0.w), (t1 = tan1.w);
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.w = a * p0.w + b * t0 * dur + c * t1 * dur + d * p1.w;
    } else {
      out.w = p0.w;
    }
    return out;
  }
}
