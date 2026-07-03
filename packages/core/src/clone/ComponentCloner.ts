import { Component } from "../Component";
import { CloneManager } from "./CloneManager";
import { CloneMode } from "./enums/CloneMode";

/**
 * Custom clone interface.
 */
export interface ICustomClone {
  /**
   * @internal
   * Type default set via `@defaultCloneMode`; absence means Assignment (share).
   */
  readonly _defaultCloneMode?: CloneMode;
  /**
   * @internal
   * Post-clone hook; `cloneMap` maps every source object in the cloned subtree to its clone.
   */
  _cloneTo?(target: ICustomClone, cloneMap?: Map<object, object>): void;
  /**
   * @internal
   */
  copyFrom?(source: ICustomClone): void;
}

export class ComponentCloner {
  /**
   * Clone component (opt-out: all fields cloned except @ignoreClone).
   * @param source - Clone source
   * @param target - Clone target
   * @param cloneMap - Identity map of the cloned subtree (source object → clone)
   */
  static cloneComponent(source: Component, target: Component, cloneMap: Map<object, object>): void {
    const fieldModes = CloneManager.getFieldModes(source.constructor);
    for (const k in source) {
      const fieldMode = fieldModes.get(k);
      if (fieldMode === CloneMode.Ignore) continue;
      const sourceValue = source[k];
      const preset = target[k];
      const cloned = (target[k] = CloneManager._cloneValue(sourceValue, preset, cloneMap, fieldMode));
      // `cloned === sourceValue` ⇔ the slot shared the source value (only the Assignment path
      // returns a registered resource as-is), so it owns one reference.
      cloned === sourceValue && CloneManager._acquireSlotOwnership(cloned, preset);
    }
    (<ICustomClone>(source as unknown))._cloneTo?.(<ICustomClone>target, cloneMap);
  }
}
