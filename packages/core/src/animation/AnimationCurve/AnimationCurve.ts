import { InterpolationType } from "../enums/InterpolationType";
import { Keyframe, KeyframeValueType } from "../Keyframe";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

interface IProgress {
  curIndex: number;
  t: number;
  duration: number;
}
/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export abstract class AnimationCurve<V extends KeyframeValueType> {
  static _tempProgress: IProgress = { curIndex: -1, t: 0, duration: 0 };
  /** All keys defined in the animation curve. */
  keys: Keyframe<V>[] = [];

  protected _tempValue: V;
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
    if (!this._type._isInterpolationType && value !== InterpolationType.Step) {
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
    this._interpolation = type._isInterpolationType ? InterpolationType.Linear : InterpolationType.Step;
    this._type = type;
  }

  /**
   * Add a new key to the curve.
   * @param key - The keyframe
   */
  addKey(key: Keyframe<V>): void {
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
    return this._evaluate(time, 0, this._tempValue);
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
      if (key.time > length) {
        newLength = key.time;
      }
    }
    this._length = newLength;
  }

  /**
   * @internal
   */
  _getProgress(time: number, startIndex: number): IProgress {
    const { keys } = this;
    const { length } = this.keys;
    // Compute curIndex and nextIndex.
    let curIndex = startIndex;

    // Reset loop.
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
    const { _tempProgress } = AnimationCurve;
    const curFrameTime = keys[curIndex].time;
    const duration = keys[nextIndex].time - curFrameTime;
    const t = (time - curFrameTime) / duration;
    _tempProgress.curIndex = curIndex;
    _tempProgress.t = t;
    _tempProgress.duration = duration;
    return _tempProgress;
  }

  /**
   * @internal
   */
  _evaluate(time: number, startIndex: number, out?: V): V {
    const { keys, interpolation } = this;
    const { curIndex, t, duration } = this._getProgress(time, startIndex);

    if (!keys.length) {
      console.warn(`This curve don't have any keyframes: `, this);
      return;
    }

    const curFrame = keys[curIndex];
    const nextFrame = keys[curIndex + 1];

    let value: V;
    if (curIndex === -1) {
      value = this._type._copyValue(nextFrame.value, out);
    } else if (curIndex + 1 === length) {
      value = this._type._copyValue(curFrame.value, out);
    } else {
      const curFrame = keys[curIndex];
      const nextFrame = keys[curIndex + 1];

      switch (interpolation) {
        case InterpolationType.Linear:
          value = this._type._lerpValue(curFrame.value, nextFrame.value, t, out);
          break;
        case InterpolationType.Step:
          value = this._type._copyValue(curFrame.value, out);
          break;
        case InterpolationType.CubicSpine:
        case InterpolationType.Hermite:
          value = this._type._hermiteInterpolationValue(curFrame, nextFrame, t, duration, out);
          break;
      }
    }
    return value;
  }

  /**
   * @internal
   */
  _evaluateAdditive(time: number, startIndex: number, out?: V): V {
    const result = this._evaluate(time, startIndex, this._tempValue);
    return this._type._subtractValue(result, this.keys[0].value, out);
  }
}
