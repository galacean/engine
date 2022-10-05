import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveOwner } from "../internal/AnimationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Float32Array>>()
export class AnimationFloatArrayCurve extends AnimationCurve<Float32Array> {
  /** @internal */
  static _isReferenceType: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Float32Array>): void {
    const size = owner.referenceTargetValue.length;
    owner.defaultValue = new Float32Array(size);
    owner.fixedPoseValue = new Float32Array(size);
    owner.baseTempValue = new Float32Array(size);
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Float32Array, destValue: Float32Array, weight: number, out: Float32Array): Float32Array {
    for (let i = 0, n = out.length; i < n; ++i) {
      const src = srcValue[i];
      out[i] = src + (destValue[i] - src) * weight;
    }
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Float32Array, weight: number, out: Float32Array): Float32Array {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] += value[i] * weight;
    }
    return out;
  }

  /**
   * @internal
   */
  static _copyFromValue(scource: Float32Array, out: Float32Array): Float32Array {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] = scource[i];
    }
    return out;
  }

  /**
   * @internal
   */
  static _evaluateFrameHermite(
    frame: Keyframe<Float32Array>,
    nextFrame: Keyframe<Float32Array>,
    t: number,
    dur: number,
    out: Float32Array
  ): Float32Array {
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
        out[i] = a * p0[i] + b * t0[i] * dur + c * t1[i] * dur + d * p1[i];
      } else {
        out[i] = frame.value[i];
      }
    }
    return out;
  }

  /**
   * @internal
   */
  _evaluateAdditive(time: number, out?: Float32Array): Float32Array {
    const baseValue = this.keys[0].value;
    const value = this._evaluate(time, out);
    for (let i = 0, n = value.length; i < n; i++) {
      value[i] = value[i] - baseValue[i];
    }
    return value;
  }
}
