import { Component } from "../Component";
import { Entity } from "../Entity";
import { CloneManager } from "./CloneManager";

/**
 * Custom clone interface.
 */
export interface ICustomClone {
  /**
   * @internal
   */
  _cloneTo(target: ICustomClone): void;
}

export interface IComponentCustomClone {
  /**
   * @internal
   */
  _cloneTo(target: IComponentCustomClone, srcRoot: Entity, targetRoot: Entity): void;
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

    if ((<IComponentCustomClone>(source as unknown))._cloneTo) {
      (<IComponentCustomClone>(source as unknown))._cloneTo(
        <IComponentCustomClone>(target as unknown),
        srcRoot,
        targetRoot
      );
    }
  }
}
