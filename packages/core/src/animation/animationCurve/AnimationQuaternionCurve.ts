import { Quaternion } from "@galacean/engine-math";
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

  /** @internal */
  private static _tempConjugateQuat = new Quaternion();

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

  /**
   * @internal
   */
  static _hermiteInterpolationValue(
    frame: Keyframe<Quaternion>,
    nextFrame: Keyframe<Quaternion>,
    t: number,
    dur: number,
    out: Quaternion
  ): Quaternion {
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

  constructor() {
    super();
    this._evaluateData.value = new Quaternion();
  }
}
