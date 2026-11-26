import { ReferResource } from "../../asset/ReferResource";
import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Animates resource references. A `null` keyframe clears the reference.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<ReferResource | null>>()
export class AnimationRefCurve extends AnimationCurve<ReferResource | null> {
  /** @internal */
  static _isCopyMode: boolean = false;
  /** @internal */
  static _supportInterpolationMode: boolean = false;

  /**
   * @internal
   */
  static _initializeOwner(_owner: AnimationCurveOwner<ReferResource | null>): void {}

  /**
   * @internal
   */
  static _initializeLayerOwner(_owner: AnimationCurveLayerOwner): void {}

  /**
   * @internal
   */
  static _setValue(value: ReferResource | null): ReferResource | null {
    return value;
  }

  constructor() {
    super(0, true);
  }

  /**
   * Replace all keyframes with parallel timestamp and resource-reference arrays.
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Keyframe resource references aligned with `times` (array elements copied into internal storage)
   * @throws Error If `values.length` does not match `times.length`
   * @remarks Non-empty inputs retain `times` directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamp order; callers must pass non-decreasing `times` and must not mutate retained `times`.
   */
  setKeys(times: TypedArray, values: readonly (ReferResource | null)[]): void {
    this._setDiscreteKeys(times, values);
  }

  /** @inheritdoc */
  override evaluate(time: number): ReferResource | null | undefined {
    const result = super.evaluate(time);
    // Clear cached reference so evaluating once does not retain the resource after curve edits.
    this._evaluateData.value = null;
    return result;
  }
}
