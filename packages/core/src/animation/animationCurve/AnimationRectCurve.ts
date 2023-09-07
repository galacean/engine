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
  static _isCopyMode: boolean = true;
  /** @internal */
  static _supportInterpolationMode: boolean = false;

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
  static _setValue(source: Rect, out: Rect): Rect {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super();
    this._evaluateData.value = new Rect();
  }
}
