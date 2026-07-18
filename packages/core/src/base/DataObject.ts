import { CloneManager, markDeepCloneable } from "../clone/CloneManager";

/**
 * Base class for cloneable data objects: wherever an instance is held — a component field,
 * an array, a map — cloning produces an independent deep copy instead of a shared reference.
 * A subclass should stay constructible without arguments: the clone system creates
 * preset-less copies bare and then populates every field.
 *
 * Customize by overriding either hook, or neither (falls back to a generic structural
 * clone — construct bare, then copy every enumerable field):
 * - `_clone` — full control over both construction and population.
 * - `_copyFrom` — construction is handled for you; only populate `this` from `source`.
 */
export abstract class DataObject {
  protected _clone?: (map?: Map<object, object>) => this;
  protected _copyFrom?: (source: this, map?: Map<object, object>) => void;

  /**
   * Create an independent deep copy of this object.
   * @param map - Identity map shared across a larger clone graph; a fresh one is used if omitted
   * @returns The cloned object
   */
  clone(map: Map<object, object> = new Map()): this {
    if (this._clone) return this._clone(map);
    if (this._copyFrom) {
      const dst = <this>CloneManager._bareConstruct(<any>this.constructor);
      dst._copyFrom(this, map);
      return dst;
    }
    return CloneManager._deepClone(this, undefined, map);
  }

  /**
   * Populate this object with an independent copy of `source`'s state.
   * @param source - The object to copy from
   * @param map - Identity map shared across a larger clone graph; a fresh one is used if omitted
   */
  copyFrom(source: this, map: Map<object, object> = new Map()): void {
    if (this._copyFrom) {
      this._copyFrom(source, map);
    } else {
      CloneManager._deepClone(source, this, map);
    }
  }
}

markDeepCloneable(DataObject);
