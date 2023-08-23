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
    const keys = Object.keys(source);
    for (let i = 0, n = keys.length; i < n; i++) {
      const k = keys[i];
      const cloneMode = cloneModes[k];
      switch (cloneMode) {
        case undefined:
        case CloneMode.Assignment:
          target[k] = source[k];
          break;
        case CloneMode.Shallow:
          const sourcePropS = source[k];
          if (sourcePropS instanceof Object) {
            const tarProp = (target[k] ||= new sourcePropS.constructor());
            Object.assign(tarProp, sourcePropS);
          } else {
            // Null, undefined or primitive type
            target[k] = sourcePropS;
          }
          break;
        case CloneMode.Deep:
          const sourcePropD = source[k];
          if (sourcePropD instanceof Object) {
            const tarProp = (target[k] ||= new sourcePropD.constructor());
            CloneManager.deepCloneObject(sourcePropD, tarProp);
          } else {
            // Null, undefined or primitive type
            target[k] = sourcePropD;
          }
          break;
      }
    }
    if ((<any>source)._cloneTo) {
      (<any>source)._cloneTo(target, srcRoot, targetRoot);
    }
  }
}
