import { Component } from "../Component";
import { CloneUtil } from "./CloneUtil";
import { CloneMode } from "./enums/CloneMode";

/**
 * Clone protocol read by the clone system; every member is optional.
 */
export interface ICustomClone {
  /**
   * @internal
   * Post-clone hook; `cloneMap` maps every source object in the cloned subtree to its clone.
   */
  _cloneTo?(target: ICustomClone, cloneMap?: Map<object, object>): void;
  /**
   * @internal
   * Value-type marker — the gate copies via this instead of walking fields.
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
    const fieldModes = (<any>source)._fieldModes;
    // Own keys only: `loose` downleveling makes prototype methods enumerable.
    const keys = Object.keys(source);
    for (let i = 0, n = keys.length; i < n; i++) {
      const k = keys[i];
      const fieldMode = fieldModes?.[k];
      if (fieldMode === CloneMode.Ignore) continue;
      const sourceValue = source[k];
      const preset = target[k];
      const cloned = (target[k] = CloneUtil._cloneValue(sourceValue, preset, cloneMap, fieldMode));
      CloneUtil._transferSlotOwnership(cloned, sourceValue, preset);
    }
    (<ICustomClone>(source as unknown))._cloneTo?.(<ICustomClone>target, cloneMap);
  }
}
