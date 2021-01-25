import { Component } from "../Component";
import { CloneManager } from "./CloneManager";
import { CloneMode } from "./enums/CloneMode";

export class ComponentCloner {
  /**
   * Clone component.
   * @param source - Clone source
   * @param target - Clone target
   */
  static cloneComponent(source: Component, target: Component): void {
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
          const sourcePropS: Object = source[k];
          if (sourcePropS instanceof Object) {
            let tarProp = <Object>target[k];
            tarProp == null && (tarProp = target[k] = sourcePropS.constructor());
            Object.assign(tarProp, sourcePropS);
          } else {
            // Null or undefine and primitive type.
            target[k] = sourcePropS;
          }
          break;
        case CloneMode.Deep:
          const sourcePropD: Object = source[k];
          if (sourcePropD instanceof Object) {
            let tarProp = <Object>target[k];
            tarProp == null && (tarProp = target[k] = sourcePropD.constructor());
            CloneManager.deepCloneObject(sourcePropD, tarProp);
          } else {
            // Null or undefine and primitive type.
            target[k] = sourcePropD;
          }
          break;
      }
    }
  }
}
