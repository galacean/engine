import { Component } from "../Component";
import { CloneManager } from "./CloneManager";
import { CloneMode } from "./enums/CloneMode";

/**
 * Clone protocol read by the clone system; every member is optional.
 */
export interface ICustomClone {
  /**
   * @internal
   * Deep marker of the DataObject family and math value types; absence means the
   * built-in default decision applies.
   */
  readonly _isDeepCloneType?: boolean;
  /**
   * @internal
   * Post-clone hook; `cloneMap` maps every source object in the cloned subtree to its clone.
   */
  _cloneTo?(target: ICustomClone, cloneMap?: Map<object, object>): void;
  /**
   * @internal
   * Value-type marker — `_deepClone` copies via this instead of walking fields.
   */
  copyFrom?(source: ICustomClone): void;
}

export class ComponentCloner {
  /**
   * Clone component (opt-out: all fields cloned except @ignoreClone), then run its `_cloneTo` hook.
   * @param source - Clone source
   * @param target - Clone target
   * @param cloneMap - Identity map of the cloned subtree (source object → clone)
   */
  static cloneComponent(source: Component, target: Component, cloneMap: Map<object, object>): void {
    // Resolved once per component (a single prototype-chain walk), not once per field.
    const fieldModes = (<any>source)._fieldModes;
    for (const k in source) {
      const fieldMode = fieldModes?.[k];
      if (fieldMode === CloneMode.Ignore) continue;
      const sourceValue = source[k];
      const preset = target[k];
      const cloned = (target[k] = CloneManager._cloneValue(sourceValue, preset, cloneMap, fieldMode));
      CloneManager._transferSlotOwnership(cloned, sourceValue, preset);
    }
    (<ICustomClone>(source as unknown))._cloneTo?.(<ICustomClone>target, cloneMap);
  }
}
