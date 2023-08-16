import { IClone } from "@galacean/engine-design";

/**
 * Particle curve.
 */
export class ParticleCurve implements IClone {
  private _keys: Key[] = [];

  /**
   * The keys of the curve.
   */
  get keys(): ReadonlyArray<Key> {
    return this._keys;
  }

  constructor() {}

  /**
   * Add a key to the curve.
   * @param time - The key time
   * @param value - The key value
   */
  addKey(time: number, value: number): void {
    const keys = this._keys;
    const length = keys.length;

    const key = new Key(time, value);
    const duration = length ? keys[length - 1].time : 0;
    if (time >= duration) {
      keys.push(key);
    } else {
      let index = length;
      while (--index >= 0 && time < keys[index].time);
      keys.splice(index + 1, 0, key);
    }
  }

  /**
   * Remove a key from the curve.
   * @param index - The remove key index
   */
  removeKey(index: number): void {
    this._keys.splice(index, 1);
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
}

class Key {
  constructor(
    public time: number,
    public value: number
  ) {}
}
