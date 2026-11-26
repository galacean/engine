import { TypedArray } from "../../base/Constant";
import { InterpolationType } from "../enums/InterpolationType";
import { NumericValue, writeKeyComponents } from "../internal/AnimationCurvePack";
import { IEvaluateData } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe, KeyframeValueType } from "../Keyframe";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

const EMPTY_FLOAT64 = new Float64Array(0);

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export abstract class AnimationCurve<V extends KeyframeValueType> {
  /**
   * Fixed component count, zero for variable-width values, or null for discrete values.
   * @internal
   */
  static readonly _keyValueSize: number | null = null;

  protected _values: TypedArray | V[];
  protected _keyCount: number = 0;
  protected _valueSize: number = 0;
  protected _hasTangents: boolean = false;
  protected _evaluateData: IEvaluateData<V> = { curKeyframeIndex: 0, value: null! };
  protected _interpolation: InterpolationType;

  private _times: TypedArray = EMPTY_FLOAT64;
  private _isBufferShared: boolean = false;
  private _type: IAnimationCurveCalculator<V>;
  private _lengthListeners?: (() => void) | (() => void)[];

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

  constructor() {
    const type = (<unknown>this.constructor) as IAnimationCurveCalculator<V>;
    this._interpolation = type._supportInterpolationMode ? InterpolationType.Linear : InterpolationType.Step;
    this._type = type;
    this._valueSize = type._keyValueSize ?? 0;
    this._values = type._keyValueSize === null ? [] : EMPTY_FLOAT64;
  }

  /**
   * Add a new key to the curve.
   * Timestamps and numeric values are copied into the curve.
   * @param key - The keyframe
   * @throws Error If the value width differs from the existing variable-width curve
   */
  addKey(key: Keyframe<V>): void {
    this._editKey(this._keyCount, key);
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
   * @returns Index of the keyframe after reordering
   * @throws RangeError If `index` is out of range `[0, keyCount)`
   * @throws Error If replacing a key in a multi-key variable-width curve changes the value width
   */
  setKey(index: number, key: Keyframe<V>): number {
    this._checkIndex(index);
    return this._editKey(index, key);
  }

  /**
   * Replace all keyframes in ascending time order. Equal timestamps keep their input order.
   * @param keys - Keyframes to copy into the curve
   * @throws Error If the keys of a variable-width curve have different value widths
   */
  setKeys(keys: readonly Keyframe<V>[]): void {
    const count = keys.length;
    if (count === 0) {
      this.clearKeys();
      return;
    }

    const width = this._getKeyValueSize(keys[0]);
    const discrete = Array.isArray(this._values);
    const supportsTangents = !discrete && this._type._supportInterpolationMode;
    let hasTangents = false;
    let ordered = true;
    for (let i = 0; i < count; i++) {
      const key = keys[i];
      const size = this._getKeyValueSize(key);
      if (size !== width) {
        throw new Error(`Keyframe value length ${size} does not match curve value size ${width}.`);
      }
      if (supportsTangents && (key.inTangent !== undefined || key.outTangent !== undefined)) {
        hasTangents = true;
      }
      if (i > 0 && key.time < keys[i - 1].time) {
        ordered = false;
      }
    }

    const sortedKeys = ordered ? keys : keys.slice().sort((a, b) => a.time - b.time);
    const times = new Float64Array(count);
    const values = discrete ? new Array<V>(count) : new Float64Array(count * width * (hasTangents ? 3 : 1));
    for (let i = 0; i < count; i++) {
      const key = sortedKeys[i];
      times[i] = key.time;
      this._writeKey(values, i, key, width, hasTangents);
    }
    this._replaceKeys(times, values, width, hasTangents, false);
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

    const lastLength = this.length;
    this._ensureWritable(count, false);
    if (index + 1 < count) {
      this._moveKeys(index, index + 1, count);
    }
    this._keyCount = count - 1;
    if (Array.isArray(this._values)) {
      this._values.length = this._keyCount;
    }
    this._notifyLengthChanged(lastLength);
  }

  /**
   * Remove all keyframes from the curve.
   */
  clearKeys(): void {
    const lastLength = this.length;
    this._times = EMPTY_FLOAT64;
    this._keyCount = 0;
    this._hasTangents = false;
    this._valueSize = this._type._keyValueSize ?? 0;
    this._evaluateData.curKeyframeIndex = 0;
    this._clearValues();
    this._isBufferShared = false;
    this._notifyLengthChanged(lastLength);
  }

  /** @internal */
  _addLengthChangedListener(listener: () => void): void {
    const listeners = this._lengthListeners;
    if (!listeners) this._lengthListeners = listener;
    else if (typeof listeners === "function") this._lengthListeners = [listeners, listener];
    else listeners.push(listener);
  }

  /** @internal */
  _removeLengthChangedListener(listener: () => void): void {
    const listeners = this._lengthListeners;
    if (typeof listeners === "function") {
      if (listeners === listener) this._lengthListeners = undefined;
    } else if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
        if (listeners.length === 1) this._lengthListeners = listeners[0];
      }
    }
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

  /**
   * Borrow timestamps and values for a curve.
   * @param times - Non-decreasing timestamps in seconds
   * @param values - Values per key, packed as `[inTangent, value, outTangent]` when `hasTangents` is true
   * @param hasTangents - Whether the numeric values include tangents
   * @throws Error If value storage or length does not match the curve and timestamps
   * @remarks The loader must leave borrowed buffers unchanged after publishing the curve. Curve edits copy them on first write.
   * @internal
   */
  _setKeyBuffers(times: TypedArray, values: TypedArray | V[], hasTangents: boolean = false): void {
    const count = times.length;
    if (count === 0) {
      if (values.length !== 0) {
        throw new Error(`Expected 0 keyframe values for 0 timestamps, got ${values.length}.`);
      }
      this.clearKeys();
      return;
    }

    const discrete = Array.isArray(this._values);
    if (discrete !== Array.isArray(values)) {
      throw new Error("Keyframe values do not match the curve's storage format.");
    }
    const tangents = !discrete && this._type._supportInterpolationMode && hasTangents;
    const scalarCount = count * (tangents ? 3 : 1);
    const width = discrete ? 1 : this._type._keyValueSize || values.length / scalarCount;
    if (!Number.isInteger(width) || values.length !== scalarCount * width) {
      throw new Error(`Keyframe value buffer length ${values.length} does not match ${count} timestamps.`);
    }
    this._replaceKeys(times, values, discrete ? 0 : width, tangents, true);
  }

  protected _clearValues(): void {
    this._values = Array.isArray(this._values) ? [] : EMPTY_FLOAT64;
  }

  protected _evaluateKey(index: number, out: V): V {
    const value = (this._values as V[])[index];
    return this._type._isCopyMode ? this._type._setValue(value, out) : value;
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
    out.value = (this._values as V[])[index];
    out.inTangent = undefined;
    out.outTangent = undefined;
  }

  private _editKey(index: number, key: Keyframe<V>): number {
    const lastLength = this.length;
    const count = this._keyCount;
    const append = index === count;
    const width = this._getKeyValueSize(key);
    if (width !== this._valueSize) {
      if (count !== 0 && (append || count !== 1)) {
        throw new Error(`Keyframe value length ${width} does not match curve value size ${this._valueSize}.`);
      }
      this._clearValues();
      this._valueSize = width;
      this._hasTangents = false;
    }

    const needTangents =
      this._type._supportInterpolationMode && (key.inTangent !== undefined || key.outTangent !== undefined);
    const nextCount = append ? count + 1 : count;
    this._ensureWritable(nextCount, needTangents);
    const values = this._values as Float64Array | V[];
    if (append && Array.isArray(values)) values.length = nextCount;

    const times = this._times;
    const time = key.time;
    let target = index;
    if (index > 0 && time < times[index - 1]) {
      while (target > 0 && time < times[target - 1]) {
        target--;
      }
      this._moveKeys(target + 1, target, index);
    } else if (index + 1 < count && time > times[index + 1]) {
      while (target + 1 < count && time > times[target + 1]) {
        target++;
      }
      this._moveKeys(index, index + 1, target + 1);
    }

    this._writeKey(values, target, key, width, this._hasTangents);
    times[target] = time;
    this._keyCount = nextCount;
    this._notifyLengthChanged(lastLength);
    return target;
  }

  private _getKeyValueSize(key: Keyframe<V>): number {
    const width = this._type._keyValueSize;
    return width === 0 ? (key.value as number[] | Float32Array).length : (width ?? 0);
  }

  private _writeKey(
    values: Float64Array | V[],
    index: number,
    key: Keyframe<V>,
    width: number,
    hasTangents: boolean
  ): void {
    if (Array.isArray(values)) {
      values[index] = key.value;
      return;
    }

    const offset = hasTangents ? index * width * 3 + width : index * width;
    writeKeyComponents(values, offset, width, key.value as NumericValue);
    if (hasTangents) {
      writeKeyComponents(values, offset - width, width, key.inTangent as NumericValue | undefined);
      writeKeyComponents(values, offset + width, width, key.outTangent as NumericValue | undefined);
    }
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

    const oldValues = this._values;
    if (Array.isArray(oldValues)) {
      if (this._isBufferShared) this._values = oldValues.slice();
      this._isBufferShared = false;
      return;
    }

    const count = this._keyCount;
    const valueSize = this._valueSize;
    const newHasTangents = this._hasTangents || needTangents;
    const newStride = newHasTangents ? valueSize * 3 : valueSize;
    const promoteTangents = needTangents && !this._hasTangents;
    const minValuesLength = minKeyCount * newStride;

    if (promoteTangents || this._isBufferShared || oldValues.length < minValuesLength) {
      const nextValuesCap = this._times.length * newStride;
      const nextValues = nextValuesCap > 0 ? new Float64Array(nextValuesCap) : EMPTY_FLOAT64;
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

  private _moveKeys(dstIndex: number, srcIndex: number, endIndex: number): void {
    this._times.copyWithin(dstIndex, srcIndex, endIndex);
    const values = this._values;
    const stride = Array.isArray(values) ? 1 : this._valueSize * (this._hasTangents ? 3 : 1);
    values.copyWithin(dstIndex * stride, srcIndex * stride, endIndex * stride);
  }

  private _replaceKeys(
    times: TypedArray,
    values: TypedArray | V[],
    width: number,
    hasTangents: boolean,
    shared: boolean
  ): void {
    const lastLength = this.length;
    this._values = values;
    this._times = times;
    this._keyCount = times.length;
    this._valueSize = width;
    this._hasTangents = hasTangents;
    this._isBufferShared = shared;
    this._evaluateData.curKeyframeIndex = 0;
    this._notifyLengthChanged(lastLength);
  }

  private _notifyLengthChanged(lastLength: number): void {
    const listeners = this._lengthListeners;
    if (!listeners || lastLength === this.length) return;
    if (typeof listeners === "function") listeners();
    else for (const listener of listeners) listener();
  }

  private _checkIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this._keyCount) {
      throw new RangeError(`Keyframe index ${index} out of range [0, ${this._keyCount}).`);
    }
  }
}
