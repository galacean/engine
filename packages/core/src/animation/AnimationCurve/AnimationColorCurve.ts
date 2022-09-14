import { Color } from "@oasis-engine/math";
import { AnimationCurve } from "./AnimationCurve";
import { InterpolableValueType } from "../enums/InterpolableValueType";
import { ColorKeyframe } from "../KeyFrame";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export class AnimationColorCurve extends AnimationCurve {
  /** All keys defined in the animation curve. */
  keys: ColorKeyframe[] = [];

  /** @internal */
  _valueSize = 4;
  /** @internal */
  _valueType = InterpolableValueType.Color;

  protected _tempValue: Color = new Color();

  addKey(key: ColorKeyframe) {
    super.addKey(key);
  }

  /**
   * @internal
   */
  _evaluateAdditive(time: number, out: Color): Color {
    const { keys } = this;
    const baseValue = keys[0].value;
    this._evaluate(time, out);
    out.r -= baseValue.r;
    out.g -= baseValue.g;
    out.b -= baseValue.b;
    out.a -= baseValue.a;
    return out;
  }

  protected _evaluateLinear(frameIndex: number, nextFrameIndex: number, t: number, out: Color): Color {
    const { keys } = this;
    Color.lerp(keys[frameIndex].value, keys[nextFrameIndex].value, t, out);
    return out;
  }

  protected _evaluateStep(frameIndex: number, out: Color): Color {
    const { keys } = this;
    out.copyFrom(keys[frameIndex].value);
    return out;
  }

  protected _evaluateHermite(frameIndex: number, nextFrameIndex: number, t: number, dur: number, out: Color): Color {
    const { keys } = this;
    const curKey = keys[frameIndex];
    const nextKey = keys[nextFrameIndex];
    const p0 = curKey.value;
    const tan0 = curKey.outTangent;
    const p1 = nextKey.value;
    const tan1 = nextKey.inTangent;

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
