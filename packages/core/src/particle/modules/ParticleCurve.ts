import { DataObject } from "../../base/DataObject";
import { UpdateFlagManager } from "../../UpdateFlagManager";
import { ignoreClone } from "../../clone/CloneManager";

/**
 * Particle curve.
 */
export class ParticleCurve extends DataObject {
  private _updateManager = new UpdateFlagManager();
  private _keys = new Array<CurveKey>();
  @ignoreClone
  private _typeArray: Float32Array;
  private _typeArrayDirty = false;
  @ignoreClone
  private _updateDispatch: () => void;

  /**
   * The keys of the curve.
   */
  get keys(): ReadonlyArray<CurveKey> {
    return this._keys;
  }

  /**
   * Create a new particle curve.
   * @param keys - The keys of the curve
   */
  constructor(...keys: CurveKey[]) {
    super();
    this._updateDispatch = this._updateManager.dispatch.bind(this._updateManager);

    for (let i = 0, n = keys.length; i < n; i++) {
      const key = keys[i];
      this.addKey(key);
    }
  }

  /**
   * Add an key to the curve.
   * @param key - The key
   */
  addKey(key: CurveKey): void;

  /**
   * Add an key to the curve.
   * @param time - The key time
   * @param value - The key value
   */
  addKey(time: number, value: number): void;

  addKey(timeOrKey: number | CurveKey, value?: number): void {
    const keys = this._keys;

    if (keys.length === 4) {
      throw new Error("Curve can only have 4 keys");
    }

    const key = typeof timeOrKey === "number" ? new CurveKey(timeOrKey, value) : timeOrKey;
    this._addKey(keys, key);
    key._registerOnValueChanged(this._updateDispatch);
    this._updateDispatch();
    this._typeArrayDirty = true;
  }

  /**
   * Remove a key from the curve.
   * @param index - The remove key index
   */
  removeKey(index: number): void {
    const keys = this._keys;
    const removeKey = keys[index];
    keys.splice(index, 1);
    this._typeArrayDirty = true;
    removeKey._unRegisterOnValueChanged(this._updateDispatch);
    this._updateDispatch();
  }

  /**
   * Set the keys of the curve.
   * @param keys - The keys
   */
  setKeys(keys: CurveKey[]): void {
    this._keys.length = 0;
    for (let i = 0, n = keys.length; i < n; i++) {
      this.addKey(keys[i]);
    }
    this._typeArrayDirty = true;
  }

  /**
   * @internal
   */
  _evaluate(normalizedAge: number): number {
    const { keys } = this;
    const { length } = keys;

    for (let i = 0; i < length; i++) {
      const key = keys[i];
      const { time } = key;
      if (normalizedAge <= time) {
        if (i === 0) {
          // Small than first key
          return key.value;
        } else {
          // Between two keys
          const { time: lastTime, value: lastValue } = keys[i - 1];
          const age = (normalizedAge - lastTime) / (time - lastTime);
          return lastValue + (key.value - lastValue) * age;
        }
      }
    }
    // Large than last key
    return keys[length - 1].value;
  }

  /**
   * @internal
   */
  _evaluateCumulative(normalizedAge: number): number {
    const { keys } = this;
    const { length } = keys;
    if (length === 0) return 0;
    // Single key is a constant curve (matches `_evaluate`); its integral is value × age.
    if (length === 1) return keys[0].value * normalizedAge;

    const firstKey = keys[0];
    if (normalizedAge <= firstKey.time) return firstKey.value * normalizedAge;

    let cumulative = firstKey.value * firstKey.time;
    for (let i = 1; i < length; i++) {
      const key = keys[i];
      const lastKey = keys[i - 1];
      const segmentTime = key.time - lastKey.time;
      if (segmentTime <= 0) continue;

      if (key.time >= normalizedAge) {
        const offsetTime = normalizedAge - lastKey.time;
        const t = offsetTime / segmentTime;
        const currentValue = lastKey.value + (key.value - lastKey.value) * t;
        cumulative += (lastKey.value + currentValue) * 0.5 * offsetTime;
        return cumulative;
      }
      cumulative += (lastKey.value + key.value) * 0.5 * segmentTime;
    }
    const lastKey = keys[length - 1];
    return cumulative + lastKey.value * (normalizedAge - lastKey.time);
  }

  /**
   * @internal
   */
  _getTypeArray(): Float32Array {
    const typeArray = (this._typeArray ||= new Float32Array(4 * 2));
    if (this._typeArrayDirty) {
      const keys = this._keys;
      for (let i = 0, n = Math.min(keys.length, 4); i < n; i++) {
        const offset = i * 2;
        const key = keys[i];
        typeArray[offset] = key.time;
        typeArray[offset + 1] = key.value;
      }
      this._typeArrayDirty = false;
    }
    return typeArray;
  }

  /**
   * @internal
   */
  _registerOnValueChanged(listener: () => void): void {
    this._updateManager.addListener(listener);
  }

  /**
   * @internal
   */
  _unRegisterOnValueChanged(listener: () => void): void {
    this._updateManager.removeListener(listener);
  }

  private _addKey(keys: CurveKey[], key: CurveKey): void {
    const count = keys.length;
    const time = key.time;
    const duration = count ? keys[count - 1].time : 0;
    if (time >= duration) {
      keys.push(key);
    } else {
      let index = count;
      while (--index >= 0 && time < keys[index].time);
      keys.splice(index + 1, 0, key);
    }
  }
}

/**
 * The key of the curve.
 */
export class CurveKey extends DataObject {
  private _updateManager = new UpdateFlagManager();
  private _time: number;
  private _value: number;

  /**
   * The key time.
   */
  get time(): number {
    return this._time;
  }

  set time(value: number) {
    if (value !== this._time) {
      this._time = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * The key value.
   */
  get value(): number {
    return this._value;
  }

  set value(value: number) {
    if (value !== this._value) {
      this._value = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * Create a new key.
   */
  constructor(time: number, value: number) {
    super();
    this._time = time;
    this._value = value;
  }

  /**
   * @internal
   */
  _registerOnValueChanged(listener: () => void): void {
    this._updateManager.addListener(listener);
  }

  /**
   * @internal
   */
  _unRegisterOnValueChanged(listener: () => void): void {
    this._updateManager.removeListener(listener);
  }
}
