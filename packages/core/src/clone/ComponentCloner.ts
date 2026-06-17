import { Component } from "../Component";
import { Entity } from "../Entity";
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
   */
  _remap?(srcRoot: Entity, targetRoot: Entity): Object;
  /**
   * @internal
   */
  _cloneTo?(target: ICustomClone, srcRoot?: Entity, targetRoot?: Entity): void;
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
   */
  static cloneComponent(
    source: Component,
    target: Component,
    srcRoot: Entity,
    targetRoot: Entity,
    deepInstanceMap: Map<Object, Object>
  ): void {
    const ignoredFields = CloneManager.getIgnoredFields(source.constructor);
    for (const k in source) {
      if (ignoredFields.has(k)) continue;
      const sourceProperty = source[k];
      // Remappable references (Entity/Component)
      if (sourceProperty instanceof Object && (<ICustomClone>sourceProperty)._remap) {
        target[k] = (<ICustomClone>sourceProperty)._remap(srcRoot, targetRoot);
        continue;
      }
      // Type-driven clone
      target[k] = CloneManager._cloneValue(sourceProperty, target[k], deepInstanceMap);
    }
    (<ICustomClone>(source as unknown))._cloneTo?.(<ICustomClone>target, srcRoot, targetRoot);
  }
}
