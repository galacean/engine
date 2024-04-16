import { deepClone, ignoreClone } from "../../clone/CloneManager";

/**
 * Particle curve.
 */
export class ParticleCurve {
  @deepClone
  private _keys: CurveKey[] = [];
  @ignoreClone
  private _typeArray: Float32Array;
  private _typeArrayDirty: boolean = false;

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
    for (let i = 0, n = keys.length; i < n; i++) {
      const key = keys[i];
      this.addKey(key);
      key._onValueChanged = this._onValueChanged;
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
    key._onValueChanged = this._onValueChanged;
    this._typeArrayDirty = true;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * Remove a key from the curve.
   * @param index - The remove key index
   */
  removeKey(index: number): void {
    this._keys.splice(index, 1);
    this._typeArrayDirty = true;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * Set the keys of the curve.
   * @param keys - The keys
   */
  setKeys(keys: CurveKey[]): void {
    this._keys.length = 0;
    for (let i = 0, n = keys.length; i < n; i++) {
      const key = keys[i];
      this.addKey(key);
      key._onValueChanged = this._onValueChanged;
    }
    this._typeArrayDirty = true;
    this._onValueChanged && this._onValueChanged();
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

  /** @internal */
  _onValueChanged: () => void = null;

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
export class CurveKey {
  /** @internal */
  private _time: number;
  /** @internal */
  private _value: number;

  /** The key time. */
  public get time(): number {
    return this._time;
  }

  public set time(value: number) {
    this._time = value;
    this._onValueChanged && this._onValueChanged();
  }

  /** The key value. */
  public get value(): number {
    return this._value;
  }

  public set value(value: number) {
    this._value = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * Create a new key.
   */
  constructor(time: number, value: number) {
    this._time = time;
    this._value = value;
  }

  /** @internal */
  _onValueChanged: () => void = null;
}
