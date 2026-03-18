import { Component } from "../Component";
import { Entity } from "../Entity";
import { CloneManager } from "./CloneManager";
import { CloneUtils } from "./CloneUtils";
import { CloneMode } from "./enums/CloneMode";

/**
 * Custom clone interface.
 */
export interface ICustomClone {
  /**
   * @internal
   */
  _cloneTo?(target: ICustomClone): void;
  /**
   * @internal
   */
  copyFrom?(source: ICustomClone): void;
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
  static cloneComponent(
    source: Component,
    target: Component,
    srcRoot: Entity,
    targetRoot: Entity,
    deepInstanceMap: Map<Object, Object>
  ): void {
    const cloneModes = CloneManager.getCloneMode(source.constructor);

    for (let k in source) {
      const cloneMode = cloneModes[k];
      CloneManager.cloneProperty(source, target, k, cloneMode, srcRoot, targetRoot, deepInstanceMap);

      if (cloneMode === undefined || cloneMode === CloneMode.Assignment) {
        const sourceProperty = source[k];
        if (sourceProperty instanceof Entity) {
          target[k] = CloneUtils.remapEntity(srcRoot, targetRoot, sourceProperty);
        } else if (sourceProperty?.entity instanceof Entity) {
          target[k] = CloneUtils.remapComponent(srcRoot, targetRoot, sourceProperty);
        }
      }
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
