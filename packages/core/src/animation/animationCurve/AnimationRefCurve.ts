import { ReferResource } from "../../asset/ReferResource";
import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Animates resource references. A `null` keyframe clears the reference.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<ReferResource | null>>()
export class AnimationRefCurve extends AnimationCurve<ReferResource | null> {
  /** @internal */
  static readonly _isCopyMode = false;
  /** @internal */
  static readonly _supportInterpolationMode = false;

  /**
   * @internal
   */
  static _initializeOwner(): void {}

  constructor() {
    super(0, true);
  }

  /**
   * Replace all keyframes with parallel timestamp and resource-reference arrays.
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Keyframe resource references aligned with `times` (array elements copied into internal storage)
   * @throws Error If `values.length` does not match `times.length`
   * @remarks For non-empty inputs, `times` is retained directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamps; callers must pass non-decreasing `times` and must not mutate the retained `times` buffer.
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
