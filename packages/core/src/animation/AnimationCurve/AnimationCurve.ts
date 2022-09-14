import { InterpolableValueType } from "../enums/InterpolableValueType";
import { InterpolationType } from "../enums/InterpolationType";
import { InterpolableValue, UnionInterpolableKeyframe } from "../KeyFrame";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export abstract class AnimationCurve {
  /** All keys defined in the animation curve. */
  keys: UnionInterpolableKeyframe[] = [];
  /** The interpolationType of the animation curve. */
  interpolation: InterpolationType;

  /** @internal */
  _valueSize: number;
  /** @internal */
  _valueType: InterpolableValueType;

  protected _tempValue: InterpolableValue;
  protected _length: number = 0;
  protected _currentIndex: number = 0;

  /**
   * Animation curve length in seconds.
   */
  get length(): number {
    return this._length;
  }

  /**
   * Add a new key to the curve.
   * @param key - The keyframe
   */
  addKey(key: UnionInterpolableKeyframe): void {
    const { time } = key;
    this.keys.push(key);
    if (time > this._length) {
      this._length = time;
    }

    this.keys.sort((a, b) => a.time - b.time);
  }

  /**
   * Evaluate the curve at time.
   * @param time - The time within the curve you want to evaluate
   */
  evaluate(time: number): InterpolableValue {
    return this._evaluate(time, this._tempValue);
  }

  /**
   * Removes the keyframe at index and inserts key.
   * @param index - The index of the key to move
   * @param key - The key to insert
   */
  moveKey(index: number, key: UnionInterpolableKeyframe): void {
    this.keys[index] = key;
  }

  /**
   * Removes a key.
   * @param index - The index of the key to remove
   */
  removeKey(index: number): void {
    this.keys.splice(index, 1);
    const { keys } = this;
    const count = this.keys.length;
    let newLength = 0;
    for (let i = count - 1; i >= 0; i--) {
      if (keys[i].time > length) {
        newLength = keys[i].time;
      }
    }
    this._length = newLength;
  }

  /**
   * @internal
   */
  _evaluate(time: number, out?: InterpolableValue) {
    const { keys, interpolation } = this;
    const { length } = this.keys;

    // Compute curIndex and nextIndex.
    let curIndex = this._currentIndex;

    // Reset loop.
    if (curIndex !== -1 && time < keys[curIndex].time) {
      curIndex = -1;
    }

    let nextIndex = curIndex + 1;
    while (nextIndex < length) {
      if (time < keys[nextIndex].time) {
        break;
      }
      curIndex++;
      nextIndex++;
    }
    this._currentIndex = curIndex;
    // Evaluate value.
    let value: InterpolableValue;
    if (curIndex === -1) {
      value = this._evaluateStep(0, out);
    } else if (nextIndex === length) {
      value = this._evaluateStep(curIndex, out);
    } else {
      // Time between first frame and end frame.
      const curFrameTime = keys[curIndex].time;
      const duration = keys[nextIndex].time - curFrameTime;
      const t = (time - curFrameTime) / duration;
      const dur = duration;

      switch (interpolation) {
        case InterpolationType.Linear:
          value = this._evaluateLinear(curIndex, nextIndex, t, out);
          break;
        case InterpolationType.Step:
          value = this._evaluateStep(curIndex, out);
          break;
        case InterpolationType.CubicSpine:
        case InterpolationType.Hermite:
          value = this._evaluateHermite(curIndex, nextIndex, t, dur, out);
          break;
        default:
          value = this._evaluateLinear(curIndex, nextIndex, t, out);
          break;
      }
    }
    return value;
  }

  /**
   * @internal
   */
  abstract _evaluateAdditive(time: number, out?: InterpolableValue);

  protected abstract _evaluateLinear(
    frameIndex: number,
    nextFrameIndex: number,
    t: number,
    out: InterpolableValue
  ): InterpolableValue;

  protected abstract _evaluateStep(frameIndex: number, out: InterpolableValue): InterpolableValue;

  protected abstract _evaluateHermite(
    frameIndex: number,
    nextFrameIndex: number,
    t: number,
    dur: number,
    out: InterpolableValue
  ): InterpolableValue;
}
