import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<string>>()
export class AnimationStringCurve extends AnimationCurve<string> {
  /** @internal */
  static readonly _isCopyMode = false;
  /** @internal */
  static readonly _supportInterpolationMode = false;

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
  static _lerpValue(srcValue: string, _destValue: string): string {
    return srcValue;
  }

  /**
   * @internal
   */
  static _additiveValue(value: string, _weight: number, _source: string): string {
    return value;
  }

  constructor() {
    super();
    this._evaluateData.value = "";
  }
}
