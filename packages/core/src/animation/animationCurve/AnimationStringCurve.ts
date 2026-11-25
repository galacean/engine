import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
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
  static _lerpValue(srcValue: string, _destValue: string): string {
    return srcValue;
  }

  /**
   * @internal
   */
  static _additiveValue(value: string, _weight: number, _source: string): string {
    return value;
  }

  /**
   * @internal
   */
  static _setValue(value: string): string {
    return value;
  }

  constructor() {
    super(0, true);
    this._evaluateData.value = "";
  }

  /**
   * Replace all keyframes with parallel timestamp and value arrays.
   * When `times` is already ascending, it is retained by reference without copying (copy-on-write on mutation) and must not be mutated by the caller; unsorted inputs are copied and sorted.
   * @param times - Keyframe timestamps in seconds
   * @param values - Keyframe string values matching `times`
   */
  setKeys(times: TypedArray, values: readonly string[]): void {
    this._setDiscreteKeys(times, values);
  }
}
