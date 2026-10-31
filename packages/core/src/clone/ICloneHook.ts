/**
 * Extends automatic field cloning with type-specific behavior.
 * @typeParam T - Clone target type
 */
export interface ICloneHook<T extends object = object> {
  /**
   * Called on the source after its fields have been cloned to the target.
   * @param target - Populated clone target
   * @param cloneMap - Source-to-clone identity map for the cloned graph
   */
  _onClone(target: T, cloneMap: ReadonlyMap<object, object>): void;
}
