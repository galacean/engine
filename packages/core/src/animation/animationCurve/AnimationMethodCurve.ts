import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Object>>()
export class AnimationMethodCurve extends AnimationCurve<Object> {
  /** @internal */
  static _isCopyMode: boolean = false;
  /** @internal */
  static _supportInterpolationMode: boolean = false;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Object>): void {
    owner.defaultValue = null;
    owner.fixedPoseValue = null;
    owner.baseEvaluateData.value = null;
    owner.crossEvaluateData.value = null;
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = null;
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Object, destValue: Object): Object {
    return srcValue;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Object, base: Object, out: Object): Object {
    return src;
  }

  /**
   * @internal
   */
  static _getZeroValue(): Object {
    return null;
  }
  /**
   * @internal
   */
  static _additiveValue(value: Object, weight: number, source: Object): Object {
    return value;
  }

  /**
   * @internal
   */
  static _setValue(value: Object): Object {
    return value;
  }

  /**
   * @internal
   */
  static _hermiteInterpolationValue(frame: Keyframe<Object>): Object {
    return frame.value;
  }

  constructor() {
    super();
    this._evaluateData.value = null;
  }
}
