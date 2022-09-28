import { StaticInterfaceImplement } from "../../2d/assembler/StaticInterfaceImplement";
import { AnimationCurveOwner } from "../internal/AnimationCurveOwner/AnimationCurveOwner";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveStatic } from "./IAnimationCurveStatic";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveStatic<number>>()
export class AnimationFloatCurve extends AnimationCurve<number, number> {
  /**
   * @internal
   */
  static _lerpValue(srcValue: number, destValue: number, crossWeight: number, out: number): number {
    return srcValue + (destValue - srcValue) * crossWeight;
  }

  static _additiveValue(value: number, weight: number, out: number): void {
    out += value * weight;
    //CM: 有BUG
  }

  static _copyFrom(scource: number, out: number): void {
    out = scource;
  }

  /**
   * @internal
   */
  _initializeOwner(owner: AnimationCurveOwner<number, number>): void {
    owner._defaultValue = 0;
    owner._fixedPoseValue = 0;
    owner._baseTempValue = 0;
    owner._crossTempValue = 0;
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
