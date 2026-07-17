import { CloneManager } from "../clone/CloneManager";

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
    return <this>CloneManager._cloneValue(this, undefined, new Map());
  }
}

// Deep marker read by the clone gate; a string-keyed property survives duplicated engine
// packages, where `instanceof DataObject` would silently fail.
Object.defineProperty(DataObject.prototype, "_isDeepCloneType", { value: true });
