import { Component } from "../Component";
import { CloneManager } from "./CloneManager";
import { CloneMode } from "./enums/CloneMode";

/**
 * Custom clone interface.
 */
export interface ICustomClone {
  /**
   * @internal
   * Default clone mode for instances of this type (set via `@defaultCloneMode`).
   * Absence defaults to Assignment (shared reference).
   */
  readonly _defaultCloneMode?: CloneMode;
  /**
   * @internal
   * Post-clone hook. `cloneMap` maps every source entity/component (and deep-cloned object)
   * in the cloned subtree to its clone, for remapping references.
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
   * @param cloneMap - Identity map of the cloned subtree (source entity/component → clone)
   */
  static cloneComponent(source: Component, target: Component, cloneMap: Map<object, object>): void {
    const fieldModes = CloneManager.getFieldModes(source.constructor);
    for (const k in source) {
      const fieldMode = fieldModes.get(k);
      if (fieldMode === CloneMode.Ignore) continue;
      const sourceValue = source[k];
      const preset = target[k];
      // Field decorator (highest) → value-shape / type default (Entity/Component remap via the map).
      const cloned = (target[k] = CloneManager._cloneValue(sourceValue, preset, cloneMap, fieldMode));
      // A slot that shared the source's ref-counted resource owns one reference (returned as-is
      // only by the Assignment path for registered resources; remapped/deep values never match).
      cloned === sourceValue && CloneManager._acquireSlotOwnership(cloned, preset);
    }
    (<ICustomClone>(source as unknown))._cloneTo?.(<ICustomClone>target, cloneMap);
  }
}
