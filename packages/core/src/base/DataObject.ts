import { CloneManager, markDeepCloneable } from "../clone/CloneManager";

/**
 * Base class for cloneable data objects: wherever an instance is held — a component field,
 * an array, a map — cloning produces an independent deep copy instead of a shared reference.
 * A subclass should stay constructible without arguments: the clone system creates
 * preset-less copies bare and then populates every field.
 */
export abstract class DataObject {
  /**
   * Create an independent deep copy of this object.
   * @returns The cloned object
   */
  clone(): this {
    // A DataObject instance is Deep by construction (see the marker below) — go straight to the
    // structural clone, skipping `_cloneValue`'s mode resolution (container check, family lookup)
    // for a value whose mode is already known.
    return <this>CloneManager._deepClone(this, undefined, new Map());
  }
}

markDeepCloneable(DataObject);
