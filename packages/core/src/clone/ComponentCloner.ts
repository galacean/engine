import { Component } from "../Component";
import { CloneManager } from "./CloneManager";
import { CloneMode } from "./enums/CloneMode";

/**
 * Custom clone interface.
 */
export interface ICustomClone {
  /**
   * @internal
   * Default clone mode for instances of this type, applied when a field holding the instance is
   * undecorated (set via `@defaultCloneMode`). Absence falls back to deep clone.
   */
  readonly _defaultCloneMode?: CloneMode;
  /**
   * @internal
   */
  _cloneTo?(target: ICustomClone, cloneMap?: Map<Object, Object>): void;
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
  static cloneComponent(source: Component, target: Component, cloneMap: Map<Object, Object>): void {
    CloneManager.getProperties(source.constructor).forEach((k) => {
      CloneManager.cloneProperty(source, target, k, cloneMap);
    });
    (<ICustomClone>(source as unknown))._cloneTo?.(<ICustomClone>target, cloneMap);
  }
}
