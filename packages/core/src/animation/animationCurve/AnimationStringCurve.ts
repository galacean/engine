import { TypedArray } from "../../base/Constant";
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
    super(0, true);
    this._evaluateData.value = "";
  }

  /**
   * Replace all keyframes with parallel timestamp and string arrays.
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Keyframe string values aligned with `times` (copied into internal storage)
   * @throws Error If `values.length` does not match `times.length`
   * @remarks For non-empty inputs, `times` is retained directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamps; callers must pass non-decreasing `times` and must not mutate the retained `times` buffer.
   */
  setKeys(times: TypedArray, values: readonly string[]): void {
    this._setDiscreteKeys(times, values);
  }
}
