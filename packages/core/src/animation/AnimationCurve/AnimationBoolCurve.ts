import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { InterpolationType } from "../enums/InterpolationType";
import { AnimationCurveOwner } from "../internal/AnimationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<boolean>>()
export class AnimationBoolCurve extends AnimationCurve<boolean> {
  /** @internal */
  static _isReferenceType: boolean = false;
  /** @internal */
  static _isInterpolationType: boolean = false;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<boolean>): void {}

  /**
   * @internal
   */
  static _lerpValue(srcValue: boolean, destValue: boolean): boolean {
    return destValue;
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
  static _copyValue(value: boolean): boolean {
    return value;
  }

  /**
   * @internal
   */
  static _hermiteInterpolationValue(frame: Keyframe<boolean>): boolean {
    return frame.value;
  }

  get interpolation(): InterpolationType {
    return this._interpolation;
  }

  /**
   * @override
   * The interpolationType of the animation curve.
   */
  _setInterpolation(value: InterpolationType): void {
    if (value != InterpolationType.Step) {
      throw "Interpolation type must be `InterpolationType.Step`";
    }
    this._interpolation = value;
  }
}
