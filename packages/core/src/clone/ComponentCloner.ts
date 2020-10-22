import { IClone } from "@alipay/o3-design";
import { ReferenceObject } from "../asset/ReferenceObject";
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
    const cloneModes = CloneManager._cloneModeMap.get(source.constructor);
    if (cloneModes) {
      for (const k in source) {
        const cloneMode = cloneModes[k];
        switch (cloneMode) {
          case undefined:
          case CloneMode.Shallow:
            target[k] = source[k];
            break;
          case CloneMode.Deep:
            const sourceProp: Object = source[k];
            if (sourceProp || sourceProp instanceof ReferenceObject) {
              let tarProp = <Object>target[k];
              tarProp || (tarProp = target[k] = sourceProp.constructor());
              ComponentCloner.cloneComponentProp(sourceProp, tarProp);
            } else {
              // null or undefine and extends ReferenceObject
              target[k] = sourceProp;
            }
            break;
        }
      }
    } else {
      // never register any props
      Object.assign(target, source);
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
      for (const k in source) {
        const sourceItem = source[k];
        const itemType = typeof sourceItem;
        if (
          sourceItem == null ||
          sourceItem instanceof ReferenceObject ||
          itemType === "number" ||
          itemType === "string" ||
          itemType === "boolean"
        ) {
          target[k] = sourceItem;
        } else {
          let targetItem = target[k];
          targetItem || (target[k] = targetItem = this.constructor());
          ComponentCloner.cloneComponentProp(sourceItem, targetItem);
        }
      }
    } else if (type === Array) {
      const arraySource = <Object[]>source;
      const arrayTarget = <Object[]>target;
      const length = arraySource.length;
      arrayTarget.length = length;
      for (let i = 0; i < length; i++) {
        const sourceItem = arraySource[i];
        const itemType = typeof sourceItem;
        if (
          sourceItem == null ||
          sourceItem instanceof ReferenceObject ||
          itemType === "number" ||
          itemType === "string" ||
          itemType === "boolean"
        ) {
          arrayTarget[i] = sourceItem;
        } else {
          let targetItem = arrayTarget[i];
          targetItem || (arrayTarget[i] = targetItem = this.constructor());
          ComponentCloner.cloneComponentProp(sourceItem, targetItem);
        }
      }
    } else {
      (<IClone>source).cloneTo(target);
    }
  }
}
