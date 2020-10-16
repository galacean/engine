import { IClone } from "@alipay/o3-design";
import { Component } from "../Component";
import { CloneMode } from "./enums/CloneMode";

/**
 * 属性装饰器，组件克隆时对属性进行忽略。
 */
export function ignoreClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Ignore);
}

/**
 * 属性装饰器，组件克隆时对属性进行深克隆。
 */
export function deepClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Deep);
}

/**
 * 属性装饰器，组件克隆时对属性进行浅克隆。
 */
export function shallowClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Shallow);
}

/**
 * @internal
 * 克隆管理员。
 */
export class CloneManager {
  private static _cloneModeMap = new Map<Object, Object>();

  /**
   * 注释克隆模式。
   * @param target - 克隆目标类型
   * @param propertyKey - 属性名称
   * @param mode - 克隆模式
   */
  static registerCloneMode(target: Object, propertyKey: string, mode: CloneMode): void {
    let targetMap = CloneManager._cloneModeMap.get(target.constructor);
    if (!targetMap) {
      targetMap = {};
      CloneManager._cloneModeMap.set(target.constructor, targetMap);
    }
    targetMap[propertyKey] = mode;
  }

  /**
   * 克隆组件。
   * @param source - 克隆源
   * @param target - 克隆目标
   */
  static cloneComponent(source: Component, target: Component): void {
    const cloneModes = CloneManager._cloneModeMap.get(source.constructor);
    for (const k in source) {
      const cloneMode = cloneModes[k];
      switch (cloneMode) {
        case undefined:
        case CloneMode.Shallow:
          target[k] = source[k];
          break;
        case CloneMode.Deep:
          const sourceProp: Object = source[k];
          if (sourceProp) {
            let tarProp = <Object>target[k];
            tarProp || (tarProp = target[k] = sourceProp.constructor());
            CloneManager.cloneComponentProp(sourceProp, tarProp);
          } else {
            // null or undefine
            target[k] = sourceProp;
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
      for (const k in source) {
        const sourceItem = source[k];
        const itemType = typeof sourceItem;
        // base type or null/undefine
        if (sourceItem == null || itemType === "number" || itemType === "string" || itemType === "boolean") {
          target[k] = sourceItem;
        } else {
          let targetItem = target[k];
          targetItem || (target[k] = targetItem = this.constructor());
          CloneManager.cloneComponentProp(sourceItem, targetItem);
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
        // base type or null/undefine
        if (sourceItem == null || itemType === "number" || itemType === "string" || itemType === "boolean") {
          arrayTarget[i] = sourceItem;
        } else {
          let targetItem = arrayTarget[i];
          targetItem || (arrayTarget[i] = targetItem = this.constructor());
          CloneManager.cloneComponentProp(sourceItem, targetItem);
        }
      }
    } else {
      (<IClone>source).cloneTo(target);
    }
  }
}
