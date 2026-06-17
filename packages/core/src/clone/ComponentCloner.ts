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
   * Default clone mode for instances of this type when encountered as a value in a field.
   * Set via `@defaultCloneMode`. Absence defaults to Assignment (shared reference).
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
   * Clone component.
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
    const cloneModes = CloneManager.getCloneMode(source.constructor);
    for (let k in source) {
      CloneManager.cloneProperty(source, target, k, cloneModes[k], srcRoot, targetRoot, deepInstanceMap);
    }
    (<ICustomClone>(source as unknown))._cloneTo?.(<ICustomClone>target, srcRoot, targetRoot);
  }
}
