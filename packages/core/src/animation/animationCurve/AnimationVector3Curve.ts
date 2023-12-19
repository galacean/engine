import { Vector3 } from "@galacean/engine-math";
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
  static _relativeBaseValue(base: Vector3, out: Vector3): Vector3 {
    Vector3.subtract(out, base, out);
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

  /**
   * @internal
   */
  static _hermiteInterpolationValue(
    frame: Keyframe<Vector3>,
    nextFrame: Keyframe<Vector3>,
    t: number,
    dur: number,
    out: Vector3
  ): Vector3 {
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

    return out;
  }

  constructor() {
    super();
    this._evaluateData.value = new Vector3();
  }
}
