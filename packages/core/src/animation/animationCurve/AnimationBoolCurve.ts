import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
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
  static _lerpValue(srcValue: boolean, _destValue: boolean): boolean {
    return srcValue;
  }

  /**
   * @internal
   */
  static _additiveValue(value: boolean, _weight: number, _source: boolean): boolean {
    return value;
  }

  /**
   * @internal
   */
  static _setValue(value: boolean): boolean {
    return value;
  }

  constructor() {
    super(0, true);
    this._evaluateData.value = false;
  }

  /**
   * Replace all keyframes with parallel timestamp and value arrays.
   * When `times` is already ascending, it is retained by reference without copying (copy-on-write on mutation) and must not be mutated by the caller; unsorted inputs are copied and sorted.
   * @param times - Keyframe timestamps in seconds
   * @param values - Keyframe boolean values matching `times`
   */
  setKeys(times: TypedArray, values: readonly boolean[]): void {
    this._setDiscreteKeys(times, values);
  }
}
