import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveOwner } from "../internal/AnimationCurveOwner/AnimationCurveOwner";
import { AnimationCurveValueOwner } from "../internal/AnimationCurveOwner/AnimationCurveValueOwner";
import { AnimationCurve } from "./AnimationCurve";
import { AnimationCurveOwnertType } from "./interfaces/IAnimationCurveCalculator";
import { IAnimationValueCurveCalculator } from "./interfaces/IAnimationValueCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationValueCurveCalculator<number>>()
export class AnimationFloatCurve extends AnimationCurve<number> {
  /** @internal */
  static _ownerType: AnimationCurveOwnertType = AnimationCurveValueOwner;

  /**
   * @internal
   */
  static _lerpValue(srcValue: number, destValue: number, crossWeight: number): number {
    return srcValue + (destValue - srcValue) * crossWeight;
  }

  /**
   * @internal
   */
  static _additiveValue(value: number, weight: number, scource: number): number {
    scource += value * weight;
    return scource;
  }

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<number>): void {
    owner.defaultValue = 0;
    owner.fixedPoseValue = 0;
    owner.baseTempValue = 0;
    owner.crossTempValue = 0;
  }

  /**
   * @internal
   */
  _evaluateAdditive(time: number, out?: number): number {
    const baseValue = this.keys[0].value;
    const value = this._evaluate(time);
    return value - baseValue;
  }

  protected _evaluateLinear(frameIndex: number, nextFrameIndex: number, t: number): number {
    const { keys } = this;
    return keys[frameIndex].value * (1 - t) + keys[nextFrameIndex].value * t;
  }

  protected _evaluateStep(frameIndex: number): number {
    return this.keys[frameIndex].value;
  }

  protected _evaluateHermite(frameIndex: number, nextFrameIndex: number, t: number, dur: number): number {
    const { keys } = this;
    const curKey = keys[frameIndex];
    const nextKey = keys[nextFrameIndex];

    const t0 = curKey.outTangent,
      t1 = nextKey.inTangent,
      p0 = curKey.value,
      p1 = nextKey.value;
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      const t2 = t * t;
      const t3 = t2 * t;
      const a = 2.0 * t3 - 3.0 * t2 + 1.0;
      const b = t3 - 2.0 * t2 + t;
      const c = t3 - t2;
      const d = -2.0 * t3 + 3.0 * t2;
      return a * p0 + b * t0 * dur + c * t1 * dur + d * p1;
    } else {
      return curKey.value;
    }
  }
}
