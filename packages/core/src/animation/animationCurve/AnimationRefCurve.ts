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
   * When `times` is already ascending, it is retained by reference without copying (copy-on-write on mutation) and must not be mutated by the caller; unsorted inputs are copied and sorted.
   * @param times - Keyframe timestamps in seconds
   * @param values - Keyframe resource references matching `times`
   */
  setKeys(times: TypedArray, values: readonly (ReferResource | null)[]): void {
    this._setDiscreteKeys(times, values);
  }

  /** @inheritdoc */
  override evaluate(time: number): ReferResource | null | undefined {
    const result = super.evaluate(time);
    this._evaluateData.value = null;
    return result;
  }
}
