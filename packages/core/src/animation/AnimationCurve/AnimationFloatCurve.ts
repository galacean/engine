import { AnimationCurve } from "./AnimationCurve";
import { InterpolableValueType } from "../enums/InterpolableValueType";
import { FloatKeyframe } from "../KeyFrame";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export class AnimationFloatCurve extends AnimationCurve {
  /** All keys defined in the animation curve. */
  keys: FloatKeyframe[] = [];

  /** @internal */
  _valueSize = 1;
  /** @internal */
  _valueType = InterpolableValueType.Float;

  addKey(key: FloatKeyframe) {
    super.addKey(key);
  }

  /**
   * @internal
   */
  _evaluateAdditive(time: number): number {
    const { keys } = this;
    const baseValue = keys[0].value;
    const value = this._evaluate(time) as number;
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
