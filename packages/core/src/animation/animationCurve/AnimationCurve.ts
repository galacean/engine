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
  protected _values: TypedArray = EMPTY_FLOAT32;
  protected _keyCount: number = 0;
  protected _valueSize: number = 0;
  protected _hasTangents: boolean = false;
  protected _evaluateData: IEvaluateData<V> = { curKeyframeIndex: 0, value: null! };
  protected _interpolation: InterpolationType;

  private _times: TypedArray = EMPTY_FLOAT64;
  private _isBufferShared: boolean = false;
  private _discreteValues: V[] | null;
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
   * Animation curve length in seconds (`0` when empty or the final timestamp is non-positive).
   */
  get length(): number {
    const last = this._keyCount > 0 ? this._times[this._keyCount - 1] : 0;
    return last > 0 ? last : 0;
  }

  /**
   * Number of keyframes stored in the curve.
   */
  get keyCount(): number {
    return this._keyCount;
  }

  constructor(valueSize: number = 0, isDiscrete: boolean = false) {
    const type = (<unknown>this.constructor) as IAnimationCurveCalculator<V>;
    this._interpolation = type._supportInterpolationMode ? InterpolationType.Linear : InterpolationType.Step;
    this._type = type;
    this._valueSize = valueSize;
    this._discreteValues = isDiscrete ? [] : null;
  }

  /**
   * Add a new key to the curve.
   * Numeric keyframe values are copied into flat float32 storage; mutating `key` afterward does not affect the curve.
   * @param key - The keyframe
   * @throws Error If `key.value.length` mismatches an existing variable-width array curve
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
  }

  /**
   * Read a snapshot of the keyframe at the specified index.
   * Mutating the returned `Keyframe` does not modify the curve; call `setKey` to apply edits.
   * @param index - Keyframe index in `[0, keyCount)`
   * @param out - Optional keyframe instance to populate and return (compatible `value` and tangent objects are reused in place)
   * @throws RangeError If `index` is out of range `[0, keyCount)`
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
   * @param index - Keyframe index in `[0, keyCount)`
   * @param key - Replacement keyframe (timestamps and numeric values are copied into storage)
   * @throws RangeError If `index` is out of range `[0, keyCount)`
   * @throws Error If replacing a key in a multi-key variable-width array curve changes `key.value.length`
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
  }

  /**
   * Evaluate the curve at time.
   * @param time - Time in seconds
   * @returns Evaluated value, or `undefined` when the curve has no keys; mutable math/array results reuse an internal buffer overwritten by subsequent calls
   */
  evaluate(time: number): V | undefined {
    return this._evaluate(time, this._evaluateData);
  }

  /**
   * Remove the keyframe at the specified index.
   * @param index - Keyframe index in `[0, keyCount)`
   * @throws RangeError If `index` is out of range `[0, keyCount)`
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
    if (this._discreteValues !== null) {
      this._discreteValues.length = this._keyCount;
    }
  }

  /**
   * Remove all keyframes from the curve.
   */
  clearKeys(): void {
    this._times = EMPTY_FLOAT64;
    this._keyCount = 0;
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
          if (this._hasTangents) {
            const t2 = t * t;
            const t3 = t2 * t;
            const d = -2.0 * t3 + 3.0 * t2;
            value = this._evaluateHermite(
              curIndex,
              nextIndex,
              1.0 - d,
              (t3 - 2.0 * t2 + t) * duration,
              (t3 - t2) * duration,
              d,
              evaluateData.value
            );
          } else {
            value = this._evaluateKey(curIndex, evaluateData.value);
          }
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

    this._assignTimes(times);
    this._values = values;
    this._valueSize = valueSize;
    this._hasTangents = tangents;
  }

  protected _setDiscreteKeys(times: TypedArray, values: readonly V[]): void {
    const count = times.length;
    if (values.length !== count) {
      throw new Error(`Expected ${count} keyframe values to match timestamps, got ${values.length}.`);
    }
    if (count === 0) {
      this.clearKeys();
      return;
    }

    this._assignTimes(times);
    const target = this._discreteValues!;
    target.length = count;
    for (let i = 0; i < count; i++) {
      target[i] = values[i];
    }
  }

  protected _prepareVariableValueSize(size: number, isSingleKeyReplace: boolean): void {
    if (this._keyCount === 0 || isSingleKeyReplace) {
      if (this._valueSize !== size) {
        this._clearValues();
        this._valueSize = size;
        this._hasTangents = false;
      }
    } else if (size !== this._valueSize) {
      throw new Error(`Keyframe value length ${size} does not match curve value size ${this._valueSize}.`);
    }
  }

  protected _prepareKeyValueSize(_key: Keyframe<V>, _isSingleKeyReplace: boolean): void {}

  protected _clearValues(): void {
    if (this._discreteValues !== null) {
      this._discreteValues.length = 0;
    } else {
      this._values = EMPTY_FLOAT32;
    }
  }

  protected _evaluateKey(index: number, _out: V): V {
    return this._discreteValues![index];
  }

  protected _evaluateLinear(curIndex: number, _nextIndex: number, _t: number, out: V): V {
    return this._evaluateKey(curIndex, out);
  }

  protected _evaluateHermite(
    curIndex: number,
    _nextIndex: number,
    _a: number,
    _bd: number,
    _cd: number,
    _d: number,
    out: V
  ): V {
    return this._evaluateKey(curIndex, out);
  }

  protected _subtractFirstKey(out: V): V {
    return out;
  }

  protected _readKeyAt(index: number, out: Keyframe<V>): void {
    out.value = this._discreteValues![index];
    out.inTangent = undefined;
    out.outTangent = undefined;
  }

  protected _writeKeyAt(index: number, key: Keyframe<V>): void {
    this._discreteValues![index] = key.value;
  }

  private _ensureWritable(minKeyCount: number, needTangents: boolean): void {
    const oldTimes = this._times;
    // Copy borrowed timestamps into an owned Float64Array before mutating so added keys keep double precision.
    if (this._isBufferShared || oldTimes.length < minKeyCount) {
      const nextCap = oldTimes.length < minKeyCount ? Math.max(4, minKeyCount, oldTimes.length * 2) : oldTimes.length;
      const nextTimes = new Float64Array(nextCap);
      nextTimes.set(oldTimes);
      this._times = nextTimes;
    }

    if (this._discreteValues !== null) {
      this._isBufferShared = false;
      return;
    }

    const count = this._keyCount;
    const valueSize = this._valueSize;
    const newHasTangents = this._hasTangents || needTangents;
    const newStride = newHasTangents ? valueSize * 3 : valueSize;
    const oldValues = this._values;
    const promoteTangents = needTangents && !this._hasTangents;
    const minValuesLength = minKeyCount * newStride;

    if (promoteTangents || this._isBufferShared || oldValues.length < minValuesLength) {
      const nextValuesCap = this._times.length * newStride;
      const nextValues = nextValuesCap > 0 ? new Float32Array(nextValuesCap) : EMPTY_FLOAT32;
      if (promoteTangents && oldValues.length > 0) {
        // Encode absent tangents as NaN so Hermite segments without tangents step-hold p0 instead of using slope 0.
        nextValues.fill(NaN, 0, count * newStride);
        for (let i = 0; i < count; i++) {
          const srcBase = i * valueSize;
          const dstBase = i * newStride + valueSize;
          for (let j = 0; j < valueSize; j++) {
            nextValues[dstBase + j] = oldValues[srcBase + j];
          }
        }
      } else {
        nextValues.set(oldValues);
      }
      this._values = nextValues;
    }

    this._hasTangents = newHasTangents;
    this._isBufferShared = false;
  }

  private _shiftValues(dstIndex: number, srcIndex: number, endIndex: number): void {
    const discreteValues = this._discreteValues;
    if (discreteValues !== null) {
      const count = endIndex - srcIndex;
      if (dstIndex > srcIndex) {
        for (let i = count - 1; i >= 0; i--) {
          discreteValues[dstIndex + i] = discreteValues[srcIndex + i];
        }
      } else {
        for (let i = 0; i < count; i++) {
          discreteValues[dstIndex + i] = discreteValues[srcIndex + i];
        }
      }
      return;
    }

    const stride = this._hasTangents ? this._valueSize * 3 : this._valueSize;
    if (stride > 0) {
      (this._values as Float32Array).copyWithin(dstIndex * stride, srcIndex * stride, endIndex * stride);
    }
  }

  private _assignTimes(times: TypedArray): void {
    // Callers guarantee non-decreasing, immutable timestamps; defer copying to _ensureWritable.
    this._times = times;
    this._isBufferShared = true;
    this._keyCount = times.length;
    this._evaluateData.curKeyframeIndex = 0;
  }

  private _checkIndex(index: number): void {
    if (index < 0 || index >= this._keyCount) {
      throw new RangeError(`Keyframe index ${index} out of range [0, ${this._keyCount}).`);
    }
  }
}
