import { IClone } from "@galacean/engine-design";

/**
 * Particle curve.
 */
export class ParticleCurve implements IClone {
  private _keys: Key[] = [];
  private _typeArray: Float32Array;
  private _typeArrayDirty: boolean = false;

  /**
   * The keys of the curve.
   */
  get keys(): ReadonlyArray<Key> {
    return this._keys;
  }

  /**
   * Create a new particle curve.
   * @param keys - The keys of the curve
   */
  constructor(...keys: Key[]) {
    for (let i = 0, n = keys.length; i < n; i++) {
      const key = keys[i];
      this.addKey(key);
    }
  }

  /**
   * Add an key to the curve.
   * @param key - The key
   */
  addKey(key: Key): void;

  /**
   * Add an key to the curve.
   * @param time - The key time
   * @param value - The key value
   */
  addKey(time: number, value: number): void;

  addKey(timeOrKey: number | Key, value?: number): void {
    const keys = this._keys;
    const length = keys.length;

    if (length === 4) {
      throw new Error("Curve can only have 4 keys");
    }

    const key = typeof timeOrKey === "number" ? new Key(timeOrKey, value) : timeOrKey;
    const time = key.time;
    const duration = length ? keys[length - 1].time : 0;
    if (time >= duration) {
      keys.push(key);
    } else {
      let index = length;
      while (--index >= 0 && time < keys[index].time);
      keys.splice(index + 1, 0, key);
    }
    this._typeArrayDirty = true;
  }

  /**
   * Remove a key from the curve.
   * @param index - The remove key index
   */
  removeKey(index: number): void {
    this._keys.splice(index, 1);
    this._typeArrayDirty = true;
  }

  /**
   * @inheritDoc
   */
  cloneTo(dest: ParticleCurve): void {}

  /**
   * @inheritDoc
   */
  clone(): ParticleCurve {
    let destCurve = new ParticleCurve();
    this.cloneTo(destCurve);
    return destCurve;
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
}

/**
 * The key of the curve.
 */
export class Key {
  /**
   * Create a new key.
   */
  constructor(
    /** The key time. */
    public time: number,
    /** The key value. */
    public value: number
  ) {
    this.time;
  }
}
