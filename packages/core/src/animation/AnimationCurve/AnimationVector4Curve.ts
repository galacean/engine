import { Vector4 } from "@oasis-engine/math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveOwner } from "../internal/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Vector4>>()
export class AnimationVector4Curve extends AnimationCurve<Vector4> {
  static _isReferenceType: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Vector4>): void {
    owner.defaultValue = new Vector4();
    owner.fixedPoseValue = new Vector4();
    owner.baseTempValue = new Vector4();
    owner.crossTempValue = new Vector4();
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
  static _copyFromValue(scource: Vector4, out: Vector4): Vector4 {
    out.copyFrom(scource);
    return out;
  }

  static _evaluateFrameHermite(
    frame: Keyframe<Vector4>,
    nextFrame: Keyframe<Vector4>,
    t: number,
    dur: number,
    out: Vector4
  ): Vector4 {
    const p0 = frame.value;
    const tan0 = frame.outTangent;
    const p1 = nextFrame.value;
    const tan1 = nextFrame.inTangent;

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

  /**
   * @internal
   */
  _evaluateAdditive(time: number, out?: Vector4): Vector4 {
    const baseValue = this.keys[0].value;
    this._evaluate(time, out);
    Vector4.subtract(out, baseValue, out);
    return out;
  }
}
