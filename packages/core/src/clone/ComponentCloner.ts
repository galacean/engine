import { IReferable } from "../asset/IReferable";
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
    // Component fields own their shared ref-counted resources (slot-ownership contract). Hosts
    // without per-field destroy logic (Script) record the acquisitions and release them on destroy.
    const refs: IReferable[] | null = (<any>target)._useCloneRefLedger
      ? ((<any>target)._cloneAcquiredRefs ||= [])
      : null;
    const fieldModes = CloneManager.getFieldModes(source.constructor);
    for (const k in source) {
      const fieldMode = fieldModes.get(k);
      if (fieldMode === CloneMode.Ignore) continue;
      // Field decorator (highest) → value-shape / type default (Entity/Component remap via the map).
      target[k] = CloneManager._cloneValue(source[k], target[k], cloneMap, fieldMode, refs);
    }
    (<ICustomClone>(source as unknown))._cloneTo?.(<ICustomClone>target, cloneMap);
  }
}
