import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<boolean>>()
export class AnimationBoolCurve extends AnimationCurve<boolean> {
  /** @internal */
  static readonly _isCopyMode = false;
  /** @internal */
  static readonly _supportInterpolationMode = false;

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
  static _lerpValue(srcValue: boolean, _destValue: boolean): boolean {
    return srcValue;
  }

  /**
   * @internal
   */
  static _additiveValue(value: boolean, _weight: number, _source: boolean): boolean {
    return value;
  }

  constructor() {
    super();
    this._evaluateData.value = false;
  }
}
