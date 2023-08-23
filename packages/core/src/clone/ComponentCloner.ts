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
   */
  _cloneTo(target: ICustomClone, srcRoot: Entity, targetRoot: Entity): void;
}

export class ComponentCloner {
  /**
   * Clone component.
   * @param source - Clone source
   * @param target - Clone target
   */
  static cloneComponent(source: Component, target: Component, srcRoot: Entity, targetRoot: Entity): void {
    const cloneModes = CloneManager.getCloneMode(source.constructor);

    for (let k in source) {
      CloneManager.cloneProperty(source, target, k, cloneModes[k]);
    }

    if ((<any>source)._cloneTo) {
      (<any>source)._cloneTo(target, srcRoot, targetRoot);
    }
  }
}
