import { IClone } from "@oasis-engine/design";
import { Component } from "../Component";
import { CloneManager } from "./CloneManager";
import { CloneMode } from "./enums/CloneMode";

export class ComponentCloner {
  /**
   * 克隆组件。
   * @param source - 克隆源
   * @param target - 克隆目标
   */
  static cloneComponent(source: Component, target: Component): void {
    const cloneModes = CloneManager.getCloneModeMode(source.constructor);
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
            tarProp || (tarProp = target[k] = sourcePropS.constructor());
            Object.assign(tarProp, sourcePropS);
          } else {
            target[k] = sourcePropS; // null or undefine and primitive type.
          }
          break;
        case CloneMode.Deep:
          const sourcePropD: Object = source[k];
          if (sourcePropD instanceof Object) {
            let tarProp = <Object>target[k];
            tarProp || (tarProp = target[k] = sourcePropD.constructor());
            ComponentCloner.cloneComponentProp(sourcePropD, tarProp);
          } else {
            target[k] = sourcePropD; // null or undefine and primitive type.
          }
          break;
      }
    }
  }

  /**
   * 克隆组件属性。
   * @param source - 克隆源
   * @param target - 克隆目标
   */
  static cloneComponentProp(source: Object, target: Object): void {
    const type = source.constructor;
    if (type === Object) {
      const keys = Object.keys(source);
      for (let i = 0, n = keys.length; i < n; i++) {
        const k = keys[i];
        const sourceItem = source[k];
        if (sourceItem instanceof Object) {
          let targetItem = <Object>target[k];
          targetItem || (target[k] = targetItem = this.constructor());
          ComponentCloner.cloneComponentProp(sourceItem, targetItem);
        } else {
          target[k] = sourceItem; // null or undefine and primitive type.
        }
      }
    } else if (type === Array) {
      const arraySource = <Object[]>source;
      const arrayTarget = <Object[]>target;
      const length = arraySource.length;
      arrayTarget.length = length;
      for (let i = 0; i < length; i++) {
        const sourceItem = arraySource[i];
        if (sourceItem instanceof Object) {
          let targetItem = <Object>arrayTarget[i];
          targetItem || (arrayTarget[i] = targetItem = this.constructor());
          ComponentCloner.cloneComponentProp(sourceItem, targetItem);
        } else {
          arrayTarget[i] = sourceItem; // null or undefine and primitive type.
        }
      }
    } else {
      (<IClone>source).cloneTo(target);
    }
  }
}
