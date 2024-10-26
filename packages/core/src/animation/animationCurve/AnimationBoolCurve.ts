import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<boolean>>()
export class AnimationBoolCurve extends AnimationCurve<boolean> {
  /** @internal */
  static _isCopyMode: boolean = false;
  /** @internal */
  static _supportInterpolationMode: boolean = false;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<boolean>): void {
    owner.defaultValue = false;
    owner.fixedPoseValue = false;
    owner.baseEvaluateData.value = false;
    owner.crossEvaluateData.value = false;
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = false;
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: boolean, destValue: boolean): boolean {
    return srcValue;
  }

  /**
   * @internal
   */
  static _subtractValue(src: boolean, base: boolean, out: boolean): boolean {
    return src;
  }

  /**
   * @internal
   */
  static _getZeroValue(): boolean {
    return false;
  }
  /**
   * @internal
   */
  static _additiveValue(value: boolean, weight: number, source: boolean): boolean {
    return value;
  }

  /**
   * @internal
   */
  static _setValue(value: boolean): boolean {
    return value;
  }

  /**
   * @internal
   */
  static _hermiteInterpolationValue(frame: Keyframe<boolean>): boolean {
    return frame.value;
  }

  constructor() {
    super();
    this._evaluateData.value = false;
  }
}
