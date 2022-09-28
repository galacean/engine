import { InterpolationType } from "../enums/InterpolationType";
import { AnimationCurveOwner } from "../internal/AnimationCurveOwner";
import { InterpolableKeyframe, KeyFrameTangentType, KeyFrameValueType } from "../KeyFrame";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export abstract class AnimationCurve<T extends KeyFrameTangentType, V extends KeyFrameValueType> {
  /** All keys defined in the animation curve. */
  keys: InterpolableKeyframe<T, V>[] = [];
  /** The interpolationType of the animation curve. */
  interpolation: InterpolationType;

  protected _tempValue: V;
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
  addKey(key: InterpolableKeyframe<T, V>): void {
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
  evaluate(time: number): V {
    return this._evaluate(time, this._tempValue);
  }

  /**
   * Removes the keyframe at index and inserts key.
   * @param index - The index of the key to move
   * @param key - The key to insert
   */
  moveKey(index: number, key: InterpolableKeyframe<T, V>): void {
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
  _evaluate(time: number, out?: V): V {
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
    let value: V;
    if (curIndex === -1) {
      value = this._evaluateStep(0, out);
    } else if (nextIndex === length) {
      value = this._evaluateStep(curIndex, out);
    } else {
      // Time between first frame and end frame.
      const curFrameTime = keys[curIndex].time;
      const duration = keys[nextIndex].time - curFrameTime;
      const t = (time - curFrameTime) / duration;

      switch (interpolation) {
        case InterpolationType.Linear:
          value = this._evaluateLinear(curIndex, nextIndex, t, out);
          break;
        case InterpolationType.Step:
          value = this._evaluateStep(curIndex, out);
          break;
        case InterpolationType.CubicSpine:
        case InterpolationType.Hermite:
          value = this._evaluateHermite(curIndex, nextIndex, t, duration, out);
          break;
        default:
          value = this._evaluateLinear(curIndex, nextIndex, t, out);
          break;
      }
    }
    return value;
  }

  /** @internal */
  abstract _initializeOwner(owner: AnimationCurveOwner<T, V>): void;
  /** @internal */
  abstract _evaluateAdditive(time: number, out?: V): V;

  protected abstract _evaluateLinear(frameIndex: number, nextFrameIndex: number, t: number, out: V): V;
  protected abstract _evaluateStep(frameIndex: number, out: V): V;
  protected abstract _evaluateHermite(frameIndex: number, nextFrameIndex: number, t: number, dur: number, out: V): V;
}
