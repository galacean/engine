import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveOwner } from "../internal/AnimationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationReferenceCurveCalculator } from "./interfaces/IAnimationReferenceCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationReferenceCurveCalculator<number[]>>()
export class AnimationArrayCurve extends AnimationCurve<number[]> {
  static _isReferenceType: boolean = true;

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
  static _copyFromValue(scource: number[], out: number[]): void {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] = scource[i];
    }
  }

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<number[]>): void {
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

  protected _evaluateFrameLinear(
    frame: Keyframe<number[]>,
    nextFrame: Keyframe<number[]>,
    t: number,
    out: number[]
  ): number[] {
    const value = frame.value;
    const nextValue = nextFrame.value;
    for (let i = 0, n = value.length; i < n; i++) {
      out[i] = value[i] * (1 - t) + nextValue[i] * t;
    }
    return out;
  }

  protected _evaluateFrameStep(frame: Keyframe<number[]>, out: number[]): number[] {
    const value = frame.value;
    for (let i = 0, n = value.length; i < n; i++) {
      out[i] = value[i];
    }
    return out;
  }

  protected _evaluateFrameHermite(
    frame: Keyframe<number[]>,
    nextFrame: Keyframe<number[]>,
    t: number,
    duration: number,
    out: number[]
  ): number[] {
    const t0 = frame.outTangent;
    const t1 = nextFrame.inTangent;
    const p0 = frame.value;
    const p1 = nextFrame.value;

    const t2 = t * t;
    const t3 = t2 * t;
    const a = 2.0 * t3 - 3.0 * t2 + 1.0;
    const b = t3 - 2.0 * t2 + t;
    const c = t3 - t2;
    const d = -2.0 * t3 + 3.0 * t2;

    for (let i = 0, n = p0.length; i < n; ++i) {
      if (Number.isFinite(t0[i]) && Number.isFinite(t1[i])) {
        out[i] = a * p0[i] + b * t0[i] * duration + c * t1[i] * duration + d * p1[i];
      } else {
        out[i] = frame.value[i];
      }
    }
    return out;
  }
}
