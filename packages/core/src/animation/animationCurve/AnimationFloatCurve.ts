import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<number>>()
export class AnimationFloatCurve extends AnimationCurve<number> {
  /** @internal */
  static _isCopyMode: boolean = false;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<number>): void {
    owner.defaultValue = 0;
    owner.fixedPoseValue = 0;
    owner.baseEvaluateData.value = 0;
    owner.crossEvaluateData.value = 0;
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = 0;
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: number, destValue: number, crossWeight: number): number {
    return srcValue + (destValue - srcValue) * crossWeight;
  }

  /**
   * @internal
   */
  static _additiveValue(value: number, weight: number, source: number): number {
    return (source += value * weight);
  }

  /**
   * @internal
   */
  static _subtractValue(src: number, base: number): number {
    return src - base;
  }

  /**
   * @internal
   */
  static _getZeroValue(): number {
    return 0;
  }

  /**
   * @internal
   */
  static _setValue(source: number): number {
    return source;
  }

  /**
   * @internal
   */
  static _hermiteInterpolationValue(
    frame: Keyframe<number>,
    nextFrame: Keyframe<number>,
    t: number,
    dur: number
  ): number {
    const t0 = frame.outTangent;
    const t1 = nextFrame.inTangent;
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      const t2 = t * t;
      const t3 = t2 * t;
      const a = 2.0 * t3 - 3.0 * t2 + 1.0;
      const b = t3 - 2.0 * t2 + t;
      const c = t3 - t2;
      const d = -2.0 * t3 + 3.0 * t2;
      return a * frame.value + b * t0 * dur + c * t1 * dur + d * nextFrame.value;
    } else {
      return frame.value;
    }
  }

  constructor() {
    super();
    this._evaluateData.value = 0;
  }
}
