import { ReferResource } from "../../asset/ReferResource";
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

  /** @inheritdoc */
  override evaluate(time: number): ReferResource | null | undefined {
    const result = super.evaluate(time);
    // Clear cached reference so evaluating once does not retain the resource after curve edits.
    this._evaluateData.value = null;
    return result;
  }
}
