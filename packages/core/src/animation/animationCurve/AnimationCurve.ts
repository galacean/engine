import { TypedArray } from "../../base/Constant";
import { InterpolationType } from "../enums/InterpolationType";
import { IEvaluateData } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe, KeyframeValueType } from "../Keyframe";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

const EMPTY_FLOAT32 = new Float32Array(0);
const EMPTY_FLOAT64 = new Float64Array(0);

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export abstract class AnimationCurve<V extends KeyframeValueType> {
  protected _times: TypedArray = EMPTY_FLOAT64;
  protected _values: TypedArray = EMPTY_FLOAT32;
  protected _keyCount: number = 0;
  protected _valueSize: number = 0;
  protected _length: number = 0;
  protected _hasTangents: boolean = false;
  protected _isBufferShared: boolean = false;
  protected _evaluateData: IEvaluateData<V> = { curKeyframeIndex: 0, value: null! };
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

  /**
   * Number of keyframes stored in the curve.
   */
  get keyCount(): number {
    return this._keyCount;
  }

  constructor(valueSize: number = 0) {
    const type = (<unknown>this.constructor) as IAnimationCurveCalculator<V>;
    this._interpolation = type._supportInterpolationMode ? InterpolationType.Linear : InterpolationType.Step;
    this._type = type;
    this._valueSize = valueSize;
  }

  /**
   * Add a new key to the curve.
   * @param key - The keyframe
   */
  addKey(key: Keyframe<V>): void {
    this._prepareKeyValueSize(key, false);
    const needTangents =
      this._type._supportInterpolationMode && (key.inTangent !== undefined || key.outTangent !== undefined);
    const count = this._keyCount;
    this._ensureWritable(count + 1, needTangents);

    const times = this._times as Float64Array;
    const time = key.time;
    let insertIndex = count;
    if (count > 0 && time < times[count - 1]) {
      let index = count;
      while (--index >= 0 && time < times[index]);
      insertIndex = index + 1;
      times.copyWithin(insertIndex + 1, insertIndex, count);
      this._shiftValues(insertIndex + 1, insertIndex, count);
    }

    times[insertIndex] = time;
    this._writeKeyAt(insertIndex, key);
    this._keyCount = count + 1;
    this._updateLength();
  }

  /**
   * Read the keyframe at the specified index.
   * @param index - The keyframe index
   * @param out - Optional reusable keyframe instance
   */
  getKey(index: number, out?: Keyframe<V>): Keyframe<V> {
    this._checkIndex(index);
    const key = out ?? new Keyframe<V>();
    key.time = this._times[index];
    this._readKeyAt(index, key);
    return key;
  }

  /**
   * Replace the keyframe at the specified index while maintaining ascending time order.
   * @param index - The keyframe index
   * @param key - The replacement keyframe
   */
  setKey(index: number, key: Keyframe<V>): void {
    this._checkIndex(index);
    this._prepareKeyValueSize(key, this._keyCount === 1);
    const needTangents =
      this._type._supportInterpolationMode && (key.inTangent !== undefined || key.outTangent !== undefined);
    const count = this._keyCount;
    this._ensureWritable(count, needTangents);

    const times = this._times as Float64Array;
    const newTime = key.time;
    let target = index;
    if (index > 0 && newTime < times[index - 1]) {
      while (target > 0 && newTime < times[target - 1]) {
        target--;
      }
      times.copyWithin(target + 1, target, index);
      this._shiftValues(target + 1, target, index);
    } else if (index + 1 < count && newTime > times[index + 1]) {
      while (target + 1 < count && newTime > times[target + 1]) {
        target++;
      }
      times.copyWithin(index, index + 1, target + 1);
      this._shiftValues(index, index + 1, target + 1);
    }

    times[target] = newTime;
    this._writeKeyAt(target, key);
    this._updateLength();
  }

  /**
   * Evaluate the curve at time.
   * @param time - The time within the curve you want to evaluate
   */
  evaluate(time: number): V | undefined {
    return this._evaluate(time, this._evaluateData);
  }

  /**
   * Removes a key.
   * @param index - The index of the key to remove
   */
  removeKey(index: number): void {
    this._checkIndex(index);
    const count = this._keyCount;
    if (count === 1) {
      this.clearKeys();
      return;
    }

    this._ensureWritable(count, false);
    if (index + 1 < count) {
      (this._times as Float64Array).copyWithin(index, index + 1, count);
      this._shiftValues(index, index + 1, count);
    }
    this._keyCount = count - 1;
    this._truncateValues(this._keyCount);
    this._updateLength();
  }

  /**
   * Remove all keyframes from the curve.
   */
  clearKeys(): void {
    this._times = EMPTY_FLOAT64;
    this._keyCount = 0;
    this._length = 0;
    this._hasTangents = false;
    this._isBufferShared = false;
    this._evaluateData.curKeyframeIndex = 0;
    this._clearValues();
  }

  /**
   * @internal
   */
  _evaluate(time: number, evaluateData: IEvaluateData<V>): V | undefined {
    const length = this._keyCount;
    if (!length) {
      console.warn(`This curve don't have any keyframes: `, this);
      return;
    }

    const times = this._times;
    let curIndex = evaluateData.curKeyframeIndex;

    // Reset cursor when keyframes were truncated or evaluation moved backward.
    if (curIndex !== -1 && (curIndex >= length || time < times[curIndex])) {
      curIndex = -1;
    }

    let nextIndex = curIndex + 1;
    while (nextIndex < length) {
      if (time < times[nextIndex]) {
        break;
      }
      curIndex++;
      nextIndex++;
    }
    evaluateData.curKeyframeIndex = curIndex;

    let value: V;
    if (curIndex === -1) {
      value = this._evaluateKey(0, evaluateData.value);
    } else if (nextIndex === length) {
      value = this._evaluateKey(curIndex, evaluateData.value);
    } else {
      const curFrameTime = times[curIndex];
      const duration = times[nextIndex] - curFrameTime;
      const t = (time - curFrameTime) / duration;

      switch (this._interpolation) {
        case InterpolationType.Linear:
          value = this._evaluateLinear(curIndex, nextIndex, t, evaluateData.value);
          break;
        case InterpolationType.Step:
          value = this._evaluateKey(curIndex, evaluateData.value);
          break;
        case InterpolationType.CubicSpine:
        case InterpolationType.Hermite:
          value = this._hasTangents
            ? this._evaluateHermite(curIndex, nextIndex, t, duration, evaluateData.value)
            : this._evaluateKey(curIndex, evaluateData.value);
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
    return this._subtractFirstKey(result!);
  }

  protected _setNumericKeys(times: TypedArray, values: TypedArray, fixedValueSize: number, hasTangents: boolean): void {
    const count = times.length;
    if (count === 0) {
      if (values.length !== 0) {
        throw new Error(`Expected 0 keyframe values for 0 timestamps, got ${values.length}.`);
      }
      this.clearKeys();
      return;
    }

    const tangents = this._type._supportInterpolationMode && hasTangents;
    let valueSize: number;
    if (fixedValueSize > 0) {
      const expected = count * (tangents ? fixedValueSize * 3 : fixedValueSize);
      if (values.length !== expected) {
        throw new Error(`Expected ${expected} keyframe values for ${count} keys, got ${values.length}.`);
      }
      valueSize = fixedValueSize;
    } else {
      const divisor = tangents ? count * 3 : count;
      if (values.length % divisor !== 0) {
        throw new Error(`Keyframe value buffer length ${values.length} must be a multiple of ${divisor}.`);
      }
      valueSize = values.length / divisor;
    }

    const order = this._prepareSetTimes(times);
    if (order === null) {
      this._values = values;
    } else {
      const stride = tangents ? valueSize * 3 : valueSize;
      const sortedValues = new Float32Array(count * stride);
      for (let i = 0; i < count; i++) {
        const srcBase = order[i] * stride;
        const dstBase = i * stride;
        for (let j = 0; j < stride; j++) {
          sortedValues[dstBase + j] = values[srcBase + j];
        }
      }
      this._values = sortedValues;
    }

    this._valueSize = valueSize;
    this._hasTangents = tangents;
  }

  protected _setDiscreteKeys(times: TypedArray, values: readonly V[], target: V[]): void {
    const count = times.length;
    if (values.length !== count) {
      throw new Error(`Expected ${count} keyframe values to match timestamps, got ${values.length}.`);
    }
    if (count === 0) {
      this.clearKeys();
      return;
    }

    const order = this._prepareSetTimes(times);
    target.length = count;
    if (order === null) {
      for (let i = 0; i < count; i++) {
        target[i] = values[i];
      }
    } else {
      for (let i = 0; i < count; i++) {
        target[i] = values[order[i]];
      }
    }
    this._hasTangents = false;
  }

  protected _shiftDiscreteValues(values: V[], dstIndex: number, srcIndex: number, endIndex: number): void {
    const count = endIndex - srcIndex;
    if (dstIndex > srcIndex) {
      for (let i = count - 1; i >= 0; i--) {
        values[dstIndex + i] = values[srcIndex + i];
      }
    } else if (dstIndex < srcIndex) {
      for (let i = 0; i < count; i++) {
        values[dstIndex + i] = values[srcIndex + i];
      }
    }
  }

  protected _readDiscreteKey(values: readonly V[], index: number, out: Keyframe<V>): void {
    out.value = values[index];
    out.inTangent = undefined;
    out.outTangent = undefined;
  }

  protected _writeDiscreteKey(values: V[], index: number, key: Keyframe<V>): void {
    values[index] = key.value;
  }

  protected _ensureTimesWritable(minKeyCount: number): void {
    const oldTimes = this._times;
    if (this._isBufferShared || !(oldTimes instanceof Float64Array) || oldTimes.length < minKeyCount) {
      const nextCap = oldTimes.length < minKeyCount ? Math.max(4, minKeyCount, oldTimes.length * 2) : oldTimes.length;
      const nextTimes = new Float64Array(nextCap);
      const count = this._keyCount;
      for (let i = 0; i < count; i++) {
        nextTimes[i] = oldTimes[i];
      }
      this._times = nextTimes;
    }
  }

  protected _ensureWritable(minKeyCount: number, needTangents: boolean): void {
    this._ensureTimesWritable(minKeyCount);

    const count = this._keyCount;
    const valueSize = this._valueSize;
    const oldHasTangents = this._hasTangents;
    const newHasTangents = oldHasTangents || needTangents;
    const oldStride = oldHasTangents ? valueSize * 3 : valueSize;
    const newStride = newHasTangents ? valueSize * 3 : valueSize;
    const oldValues = this._values;
    const promoteTangents = newHasTangents && !oldHasTangents;
    const minValuesLength = minKeyCount * newStride;

    if (
      promoteTangents ||
      this._isBufferShared ||
      !(oldValues instanceof Float32Array) ||
      oldValues.length < minValuesLength
    ) {
      const nextValuesCap = this._times.length * newStride;
      const nextValues = nextValuesCap > 0 ? new Float32Array(nextValuesCap) : EMPTY_FLOAT32;
      if (count > 0 && valueSize > 0 && oldValues.length > 0) {
        if (promoteTangents) {
          nextValues.fill(NaN, 0, count * newStride);
          for (let i = 0; i < count; i++) {
            const srcBase = i * valueSize;
            const dstBase = i * newStride + valueSize;
            for (let j = 0; j < valueSize; j++) {
              nextValues[dstBase + j] = oldValues[srcBase + j];
            }
          }
        } else {
          const copyLen = count * oldStride;
          for (let i = 0; i < copyLen; i++) {
            nextValues[i] = oldValues[i];
          }
        }
      }
      this._values = nextValues;
    }

    this._hasTangents = newHasTangents;
    this._isBufferShared = false;
  }

  protected _shiftValues(dstIndex: number, srcIndex: number, endIndex: number): void {
    const stride = this._hasTangents ? this._valueSize * 3 : this._valueSize;
    if (stride > 0) {
      (this._values as Float32Array).copyWithin(dstIndex * stride, srcIndex * stride, endIndex * stride);
    }
  }

  protected _prepareKeyValueSize(_key: Keyframe<V>, _isSingleKeyReplace: boolean): void {}

  protected _truncateValues(_newCount: number): void {}

  protected _clearValues(): void {
    this._values = EMPTY_FLOAT32;
  }

  protected _updateLength(): void {
    const count = this._keyCount;
    const last = count > 0 ? this._times[count - 1] : 0;
    this._length = last > 0 ? last : 0;
  }

  protected _evaluateLinear(curIndex: number, _nextIndex: number, _t: number, out: V): V {
    return this._evaluateKey(curIndex, out);
  }

  protected _evaluateHermite(curIndex: number, _nextIndex: number, _t: number, _duration: number, out: V): V {
    return this._evaluateKey(curIndex, out);
  }

  protected _subtractFirstKey(out: V): V {
    return out;
  }

  protected abstract _evaluateKey(index: number, out: V): V;
  protected abstract _readKeyAt(index: number, out: Keyframe<V>): void;
  protected abstract _writeKeyAt(index: number, key: Keyframe<V>): void;

  private _prepareSetTimes(times: TypedArray): number[] | null {
    const count = times.length;
    let prev = -Infinity;
    let ordered = true;
    for (let i = 0; i < count; i++) {
      const time = times[i];
      if (time < prev) {
        ordered = false;
        break;
      }
      prev = time;
    }

    if (ordered) {
      this._times = times;
      this._isBufferShared = true;
      this._keyCount = count;
      this._evaluateData.curKeyframeIndex = 0;
      this._updateLength();
      return null;
    }

    const order = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      order[i] = i;
    }
    order.sort((a, b) => times[a] - times[b]);

    const sortedTimes = times instanceof Float32Array ? new Float32Array(count) : new Float64Array(count);
    for (let i = 0; i < count; i++) {
      sortedTimes[i] = times[order[i]];
    }

    this._times = sortedTimes;
    this._isBufferShared = false;
    this._keyCount = count;
    this._evaluateData.curKeyframeIndex = 0;
    this._updateLength();
    return order;
  }

  private _checkIndex(index: number): void {
    if (index < 0 || index >= this._keyCount) {
      throw new RangeError(`Keyframe index ${index} out of range [0, ${this._keyCount}).`);
    }
  }
}
