import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<string>>()
export class AnimationStringCurve extends AnimationCurve<string> {
  /** @internal */
  static _isCopyMode: boolean = false;
  /** @internal */
  static _supportInterpolationMode: boolean = false;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<string>): void {
    owner.defaultValue = "";
    owner.fixedPoseValue = "";
    owner.baseEvaluateData.value = "";
    owner.crossEvaluateData.value = "";
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = "";
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: string, destValue: string): string {
    return srcValue;
  }

  /**
   * @internal
   */
  static _subtractValue(src: string, base: string, out: string): string {
    return src;
  }

  /**
   * @internal
   */
  static _getZeroValue(): string {
    return "";
  }
  /**
   * @internal
   */
  static _additiveValue(value: string, weight: number, source: string): string {
    return value;
  }

  /**
   * @internal
   */
  static _setValue(value: string): string {
    return value;
  }

  /**
   * @internal
   */
  static _hermiteInterpolationValue(frame: Keyframe<string>): string {
    return frame.value;
  }

  constructor() {
    super();
    this._evaluateData.value = "";
  }
}
