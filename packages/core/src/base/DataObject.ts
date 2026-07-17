import { CloneManager, defaultCloneMode } from "../clone/CloneManager";
import { CloneMode } from "../clone/enums/CloneMode";

/**
 * Base class for cloneable data objects: wherever an instance is held — a component field,
 * an array, a map — cloning produces an independent deep copy instead of a shared reference.
 * A subclass should stay constructible without arguments: the clone system creates
 * preset-less copies bare and then populates every field.
 */
@defaultCloneMode(CloneMode.Deep)
export abstract class DataObject {
  /**
   * Create an independent deep copy of this object.
   * @returns The cloned object
   */
  clone(): this {
    return <this>CloneManager._cloneValue(this, undefined, new Map());
  }
}
