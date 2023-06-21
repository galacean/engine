import { Rect } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Rect>>()
export class AnimationRectCurve extends AnimationCurve<Rect> {
  /** @internal */
  static _keepOriginReference: boolean = true;
  /** @internal */
  static _isInterpolationType: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Rect>): void {
    owner.defaultValue = new Rect();
    owner.fixedPoseValue = new Rect();
    owner.baseEvaluateData.value = new Rect();
    owner.crossEvaluateData.value = new Rect();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Rect();
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Rect, destValue: Rect, weight: number, out: Rect): Rect {
    Rect.lerp(srcValue, destValue, weight, out);
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Rect, weight: number, out: Rect): Rect {
    Rect.scale(value, weight, value);
    Rect.add(out, value, out);
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Rect, base: Rect, out: Rect): Rect {
    Rect.subtract(src, base, out);
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Rect): Rect {
    out.set(0, 0, 0, 0);
    return out;
  }

  /**
   * @internal
   */
  static _copyValue(source: Rect, out: Rect): Rect {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super();
    this._evaluateData.value = new Rect();
  }
}
