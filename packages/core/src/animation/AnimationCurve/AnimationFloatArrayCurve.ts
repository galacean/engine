import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveReferenceOwner } from "../internal/AnimationCurveOwner/AnimationCurveReferenceOwner";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationReferenceCurveStatic } from "./interfaces/IAnimationReferenceCurveStatic";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationReferenceCurveStatic<Float32Array, Float32Array>>()
export class AnimationFloatArrayCurve extends AnimationCurve<Float32Array, Float32Array> {
  /** @internal */
  static _isReferenceType: boolean = true;

  /**
   * @internal
   */
  static _lerpValue(srcValue: Float32Array, destValue: Float32Array, weight: number, out: Float32Array): void {
    for (let i = 0, n = out.length; i < n; ++i) {
      const src = srcValue[i];
      out[i] = src + (destValue[i] - src) * weight;
    }
  }

  /**
   * @internal
   */
  static _additiveValue(value: Float32Array, weight: number, out: Float32Array): void {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] += value[i] * weight;
    }
  }

  /**
   * @internal
   */
  static _copyFrom(scource: Float32Array, out: Float32Array): void {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] = scource[i];
    }
  }

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveReferenceOwner<Float32Array, Float32Array>): void {
    const size = owner.targetValue.length;
    owner.defaultValue = new Float32Array(size);
    owner.fixedPoseValue = new Float32Array(size);
    owner.baseTempValue = new Float32Array(size);
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

  protected _evaluateLinear(frameIndex: number, nextFrameIndex: number, t: number, out: Float32Array): Float32Array {
    const { keys } = this;
    const value = keys[frameIndex].value;
    const nextValue = keys[nextFrameIndex].value;
    for (let i = 0, n = value.length; i < n; i++) {
      out[i] = value[i] * (1 - t) + nextValue[i] * t;
    }
    return out;
  }

  protected _evaluateStep(frameIndex: number, out: Float32Array): Float32Array {
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
    dur: number,
    out: Float32Array
  ): Float32Array {
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
        out[i] = a * p0[i] + b * t0[i] * dur + c * t1[i] * dur + d * p1[i];
      } else {
        out[i] = curKey.value[i];
      }
    }
    return out;
  }
}
