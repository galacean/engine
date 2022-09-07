import { Vector2 } from "@oasis-engine/math";
import { AnimationCurve } from "./AnimationCurve";
import { InterpolableValueType } from "../enums/InterpolableValueType";
import { Vector2Keyframe } from "../KeyFrame";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export class AnimationVector2Curve extends AnimationCurve {
  /** All keys defined in the animation curve. */
  keys: Vector2Keyframe[] = [];

  /** @internal */
  _valueSize = 2;
  /** @internal */
  _valueType = InterpolableValueType.Vector2;

  protected _tempValue: Vector2 = new Vector2();

  addKey(key: Vector2Keyframe) {
    super.addKey(key);
  }

  /**
   * @internal
   */
  _evaluateAdditive(time: number, out: Vector2): Vector2 {
    const { keys } = this;
    const baseValue = keys[0].value;
    this._evaluate(time, out);
    Vector2.subtract(out, baseValue, out);
    return out;
  }

  protected _evaluateLinear(frameIndex: number, nextFrameIndex: number, t: number, out: Vector2): Vector2 {
    const { keys } = this;
    Vector2.lerp(keys[frameIndex].value, keys[nextFrameIndex].value, t, out);
    return out;
  }

  protected _evaluateStep(frameIndex: number, out: Vector2): Vector2 {
    const { keys } = this;
    out.copyFrom(keys[frameIndex].value);
    return out;
  }

  protected _evaluateHermite(
    frameIndex: number,
    nextFrameIndex: number,
    t: number,
    dur: number,
    out: Vector2
  ): Vector2 {
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
      out.x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
    } else {
      out.x = p0.x;
    }

    (t0 = tan0.y), (t1 = tan1.y);
    if (Number.isFinite(t0) && Number.isFinite(t1)) {
      out.y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
    } else {
      out.y = p0.y;
    }

    return out;
  }
}
