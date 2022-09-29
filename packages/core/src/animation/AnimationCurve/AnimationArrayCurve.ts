import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveOwner } from "../internal/AnimationCurveOwner/AnimationCurveOwner";
import { AnimationCurveReferenceOwner } from "../internal/AnimationCurveOwner/AnimationCurveReferenceOwner";
import { AnimationCurve } from "./AnimationCurve";
import { AnimationCurveOwnertType } from "./interfaces/IAnimationCurveCalculator";
import { IAnimationReferenceCurveCalculator } from "./interfaces/IAnimationReferenceCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationReferenceCurveCalculator<number[], number[]>>()
export class AnimationArrayCurve extends AnimationCurve<number[], number[]> {
  /** @internal */
  static _ownerType: AnimationCurveOwnertType = AnimationCurveReferenceOwner;

  /**
   * @internal
   */
  static _lerpValue(srcValue: number[], destValue: number[], weight: number, out: number[]): void {
    for (let i = 0, n = out.length; i < n; ++i) {
      const src = srcValue[i];
      out[i] = src + (destValue[i] - src) * weight;
    }
  }

  /**
   * @internal
   */
  static _additiveValue(value: number[], weight: number, out: number[]): void {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] += value[i] * weight;
    }
  }

  /**
   * @internal
   */
  static _copyFrom(scource: number[], out: number[]): void {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] = scource[i];
    }
  }

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<number[], number[]>): void {
    owner.defaultValue = [];
    owner.fixedPoseValue = [];
    owner.baseTempValue = [];
    owner.crossTempValue = [];
  }

  /**
   * @internal
   */
  _evaluateAdditive(time: number, out?: number[]): number[] {
    const baseValue = this.keys[0].value;
    const value = this._evaluate(time, out);
    for (let i = 0, n = value.length; i < n; i++) {
      value[i] = value[i] - baseValue[i];
    }
    return value;
  }

  protected _evaluateLinear(frameIndex: number, nextFrameIndex: number, t: number, out: number[]): number[] {
    const { keys } = this;
    const value = keys[frameIndex].value;
    const nextValue = keys[nextFrameIndex].value;
    for (let i = 0, n = value.length; i < n; i++) {
      out[i] = value[i] * (1 - t) + nextValue[i] * t;
    }
    return out;
  }

  protected _evaluateStep(frameIndex: number, out: number[]): number[] {
    const value = this.keys[frameIndex].value;
    for (let i = 0, n = value.length; i < n; i++) {
      out[i] = value[i];
    }
    return out;
  }

  protected _evaluateHermite(
    frameIndex: number,
    nextFrameIndex: number,
    t: number,
    duration: number,
    out: number[]
  ): number[] {
    const { keys } = this;
    const curKey = keys[frameIndex];
    const nextKey = keys[nextFrameIndex];
    const t0 = curKey.outTangent,
      t1 = nextKey.inTangent,
      p0 = curKey.value,
      p1 = nextKey.value,
      length = p0.length;

    for (let i = 0; i < length; ++i) {
      if (Number.isFinite(t0[i]) && Number.isFinite(t1[i])) {
        const t2 = t * t;
        const t3 = t2 * t;
        const a = 2.0 * t3 - 3.0 * t2 + 1.0;
        const b = t3 - 2.0 * t2 + t;
        const c = t3 - t2;
        const d = -2.0 * t3 + 3.0 * t2;
        out[i] = a * p0[i] + b * t0[i] * duration + c * t1[i] * duration + d * p1[i];
      } else {
        out[i] = curKey.value[i];
      }
    }
    return out;
  }
}
