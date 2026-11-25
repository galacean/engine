import { TypedArray } from "../../base/Constant";
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
    super(0, true);
    this._evaluateData.value = false;
  }

  /**
   * Replace all keyframes with parallel timestamp and boolean arrays.
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Keyframe boolean values aligned with `times` (copied into internal storage)
   * @throws Error If `values.length` does not match `times.length`
   * @remarks Non-empty inputs retain `times` directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamp order; callers must pass non-decreasing `times` and must not mutate retained `times`.
   */
  setKeys(times: TypedArray, values: readonly boolean[]): void {
    this._setDiscreteKeys(times, values);
  }
}
