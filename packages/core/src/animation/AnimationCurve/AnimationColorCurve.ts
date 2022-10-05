import { Color } from "@oasis-engine/math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveOwner } from "../internal/AnimationCurveOwner/AnimationCurveOwner";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationReferenceCurveCalculator } from "./interfaces/IAnimationReferenceCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationReferenceCurveCalculator<Color>>()
export class AnimationColorCurve extends AnimationCurve<Color> {
  static _isReferenceType: boolean = true;

  /**
   * @internal
   */
  static _lerpValue(srcValue: Color, destValue: Color, weight: number, out: Color): void {
    Color.lerp(srcValue, destValue, weight, out);
  }

  /**
   * @internal
   */
  static _additiveValue(value: Color, weight: number, out: Color): void {
    Color.scale(value, weight, value);
    Color.add(out, value, out);
  }

  /**
   * @internal
   */
  static _copyFrom(scource: Color, out: Color): void {
    out.copyFrom(scource);
  }

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Color>): void {
    owner.defaultValue = new Color();
    owner.fixedPoseValue = new Color();
    owner.baseTempValue = new Color();
    owner.crossTempValue = new Color();
  }

  /**
   * @internal
   */
  _evaluateAdditive(time: number, out?: Color): Color {
    const baseValue = this.keys[0].value;
    this._evaluate(time, out);
    out.r -= baseValue.r;
    out.g -= baseValue.g;
    out.b -= baseValue.b;
    out.a -= baseValue.a;
    return out;
  }

  protected _evaluateLinear(frame: Keyframe<Color>, nextFrame: Keyframe<Color>, t: number, out: Color): Color {
    Color.lerp(frame.value, nextFrame.value, t, out);
    return out;
  }

  protected _evaluateStep(frame: Keyframe<Color>, out: Color): Color {
    out.copyFrom(frame.value);
    return out;
  }

  protected _evaluateHermite(
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
}
