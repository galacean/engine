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
  static _isReferenceType: boolean = true;
  /** @internal */
  static _isInterpolationType: boolean = true;

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
  static _copyValue(source: number[], out: number[]): number[] {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] = source[i];
    }
    return out;
  }

  /**
   * @internal
   */
  static _hermiteInterpolationValue(
    frame: Keyframe<number[]>,
    nextFrame: Keyframe<number[]>,
    t: number,
    duration: number,
    out: number[]
  ): number[] {
    const t0 = frame.outTangent;
    const t1 = nextFrame.inTangent;
    const p0 = frame.value;
    const p1 = nextFrame.value;

    const t2 = t * t;
    const t3 = t2 * t;
    const a = 2.0 * t3 - 3.0 * t2 + 1.0;
    const b = t3 - 2.0 * t2 + t;
    const c = t3 - t2;
    const d = -2.0 * t3 + 3.0 * t2;

    for (let i = 0, n = p0.length; i < n; ++i) {
      if (Number.isFinite(t0[i]) && Number.isFinite(t1[i])) {
        out[i] = a * p0[i] + b * t0[i] * duration + c * t1[i] * duration + d * p1[i];
      } else {
        out[i] = frame.value[i];
      }
    }
    return out;
  }

  constructor() {
    super();
    this._evaluateData.value = [];
  }
}
