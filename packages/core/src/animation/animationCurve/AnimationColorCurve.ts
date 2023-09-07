import { Color } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Color>>()
export class AnimationColorCurve extends AnimationCurve<Color> {
  /** @internal */
  static _isCopyMode: boolean = true;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Color>): void {
    owner.defaultValue = new Color();
    owner.fixedPoseValue = new Color();
    owner.baseEvaluateData.value = new Color();
    owner.crossEvaluateData.value = new Color();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Color();
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Color, destValue: Color, weight: number, out: Color): Color {
    Color.lerp(srcValue, destValue, weight, out);
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Color, base: Color, out: Color): Color {
    Color.subtract(src, base, out);
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Color) {
    out.set(0, 0, 0, 0);
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Color, weight: number, out: Color): Color {
    Color.scale(value, weight, value);
    Color.add(out, value, out);
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: Color, out: Color): Color {
    out.copyFrom(source);
    return out;
  }

  /**
   * @internal
   */
  static _hermiteInterpolationValue(
    frame: Keyframe<Color>,
    nextFrame: Keyframe<Color>,
    t: number,
    dur: number,
    out: Color
  ): Color {
    const p0 = frame.value;
    const tan0 = frame.outTangent;
    const p1 = nextFrame.value;
    const tan1 = nextFrame.inTangent;

    const t2 = t * t;
    const t3 = t2 * t;
    const a = 2.0 * t3 - 3.0 * t2 + 1.0;
    const b = t3 - 2.0 * t2 + t;
    const c = t3 - t2;
    const d = -2.0 * t3 + 3.0 * t2;

    let t0 = tan0.x,
      t1 = tan1.x;
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.r = a * p0.r + b * t0 * dur + c * t1 * dur + d * p1.r;
    } else {
      out.r = p0.r;
    }

    (t0 = tan0.y), (t1 = tan1.y);
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.g = a * p0.g + b * t0 * dur + c * t1 * dur + d * p1.g;
    } else {
      out.g = p0.g;
    }

    (t0 = tan0.z), (t1 = tan1.z);
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.b = a * p0.b + b * t0 * dur + c * t1 * dur + d * p1.b;
    } else {
      out.b = p0.b;
    }

    (t0 = tan0.w), (t1 = tan1.w);
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.a = a * p0.a + b * t0 * dur + c * t1 * dur + d * p1.a;
    } else {
      out.a = p0.a;
    }

    return out;
  }

  constructor() {
    super();
    this._evaluateData.value = new Color();
  }
}
