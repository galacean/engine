import { InterpolationType } from "../enums/InterpolationType";
import { IEvaluateData } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe, KeyframeValueType } from "../Keyframe";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export abstract class AnimationCurve<V extends KeyframeValueType> {
  /** All keys defined in the animation curve. */
  keys: Keyframe<V>[] = [];

  protected _evaluateData: IEvaluateData<V> = { curKeyframeIndex: 0, value: null };
  protected _length: number = 0;
  protected _interpolation: InterpolationType;

  private _type: IAnimationCurveCalculator<V>;

  /**
   * The interpolationType of the animation curve.
   */
  get interpolation(): InterpolationType {
    return this._interpolation;
  }

  set interpolation(value: InterpolationType) {
    if (!this._type._supportInterpolationMode && value !== InterpolationType.Step) {
      this._interpolation = InterpolationType.Step;
      console.warn("The interpolation type must be `InterpolationType.Step`.");
    } else {
      this._interpolation = value;
    }
  }

  /**
   * Animation curve length in seconds.
   */
  get length(): number {
    return this._length;
  }

  constructor() {
    const type = (<unknown>this.constructor) as IAnimationCurveCalculator<V>;
    this._interpolation = type._supportInterpolationMode ? InterpolationType.Linear : InterpolationType.Step;
    this._type = type;
  }

  /**
   * Add a new key to the curve.
   * @param key - The keyframe
   */
  addKey(key: Keyframe<V>): void {
    const { time } = key;
    const { keys } = this;

    if (time >= this._length) {
      keys.push(key);
      this._length = time;
    } else {
      let index = keys.length;
      while (--index >= 0 && time < keys[index].time);
      keys.splice(index + 1, 0, key);
    }
  }

  /**
   * Evaluate the curve at time.
   * @param time - The time within the curve you want to evaluate
   */
  evaluate(time: number): V {
    return this._evaluate(time, this._evaluateData);
  }

  /**
   * Removes a key.
   * @param index - The index of the key to remove
   */
  removeKey(index: number): void {
    this.keys.splice(index, 1);
    const { keys } = this;

    let newLength = 0;
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      if (key.time > this._length) {
        newLength = key.time;
      }
    }
    this._length = newLength;
  }

  /**
   * @internal
   */
  _evaluate(time: number, evaluateData: IEvaluateData<V>): V {
    const { length } = this.keys;
    if (!length) {
      console.warn(`This curve don't have any keyframes: `, this);
      return;
    }

    const { keys, interpolation } = this;

    // Compute curIndex and nextIndex.
    let curIndex = evaluateData.curKeyframeIndex;

    // Reset loop,if delete keyfranme may cause `curIndex >= length`
    if (curIndex !== -1 && (curIndex >= length || time < keys[curIndex].time)) {
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
    evaluateData.curKeyframeIndex = curIndex;

    // Evaluate value.
    let value: V;
    if (curIndex === -1) {
      value = this._type._setValue(keys[0].value, evaluateData.value);
    } else if (nextIndex === length) {
      value = this._type._setValue(keys[curIndex].value, evaluateData.value);
    } else {
      // Time between first frame and end frame.
      const curFrame = keys[curIndex];
      const nextFrame = keys[nextIndex];
      const curFrameTime = curFrame.time;
      const duration = nextFrame.time - curFrameTime;
      const t = (time - curFrameTime) / duration;

      switch (interpolation) {
        case InterpolationType.Linear:
          value = this._type._lerpValue(curFrame.value, nextFrame.value, t, evaluateData.value);
          break;
        case InterpolationType.Step:
          value = this._type._setValue(curFrame.value, evaluateData.value);
          break;
        case InterpolationType.CubicSpine:
        case InterpolationType.Hermite:
          value = this._type._hermiteInterpolationValue(curFrame, nextFrame, t, duration, evaluateData.value);
          break;
      }
    }

    evaluateData.value = value;

    return value;
  }

  /**
   * @internal
   */
  _evaluateAdditive(time: number, evaluateData: IEvaluateData<V>): V {
    const result = this._evaluate(time, evaluateData);
    return this._type._subtractValue(result, this.keys[0].value, evaluateData.value);
  }
}
