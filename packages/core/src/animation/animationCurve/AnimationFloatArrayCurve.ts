import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Float32Array>>()
export class AnimationFloatArrayCurve extends AnimationCurve<Float32Array> {
  /** @internal */
  static _isCopyMode: boolean = true;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Float32Array>): void {
    const size = owner._assembler.getTargetValue().length;
    owner.defaultValue = new Float32Array(size);
    owner.fixedPoseValue = new Float32Array(size);
    owner.baseEvaluateData.value = new Float32Array(size);
    owner.crossEvaluateData.value = new Float32Array(size);
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    const size = (<Float32Array>owner.curveOwner._assembler.getTargetValue()).length;
    owner.finalValue = new Float32Array(size);
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
  static _subtractValue(src: Float32Array, base: Float32Array, out: Float32Array): Float32Array {
    for (let i = 0, n = src.length; i < n; i++) {
      out[i] = src[i] - base[i];
    }
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Float32Array): Float32Array {
    for (let i = 0, n = out.length; i < n; i++) {
      out[i] = 0;
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
  static _setValue(source: Float32Array, out: Float32Array): Float32Array {
    for (let i = 0, n = out.length; i < n; ++i) {
      out[i] = source[i];
    }
    return out;
  }

  /**
   * @internal
   */
  static _hermiteInterpolationValue(
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
   * @inheritdoc
   */
  override addKey(key: Keyframe<Float32Array>): void {
    super.addKey(key);

    const evaluateData = this._evaluateData;
    if (!evaluateData.value || evaluateData.value.length !== key.value.length) {
      const size = key.value.length;
      evaluateData.value = new Float32Array(size);
    }
  }
}
