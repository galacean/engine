import { Component } from "../Component";
import { CloneMode } from "./enums/CloneMode";

/**
 * 类克隆时对属性进行忽略。
 */
export function ignoreClone(target: Object, propertyKey: string): void {
  CloneModeManager.registerCloneMode(target, propertyKey, CloneMode.Ignore);
}

/**
 * 类克隆时对属性进行深克隆。
 */
export function deepClone(target: Object, propertyKey: string): void {
  CloneModeManager.registerCloneMode(target, propertyKey, CloneMode.Deep);
}

/**
 * 类克隆时对属性进行浅克隆。
 */
export function shallowClone(target: Object, propertyKey: string): void {
  CloneModeManager.registerCloneMode(target, propertyKey, CloneMode.Shallow);
}

/**
 * @internal
 * 克隆管理员。
 */
export class CloneModeManager {
  private static _cloneModeMap = new Map<Object, Object>();

  /**
   * 注释克隆模式。
   * @param target - 克隆目标类型
   * @param attribute - 属性名称
   * @param mode - 克隆模式
   */
  static registerCloneMode(target: Object, attribute: string, mode: CloneMode): void {
    let targetMap = CloneModeManager._cloneModeMap.get(target.constructor);
    if (!targetMap) {
      targetMap = {};
      CloneModeManager._cloneModeMap.set(target.constructor, targetMap);
    }
    targetMap[attribute] = mode;
  }

  /**
   * 克隆并返回克隆体。
   * @param source - 克隆源
   */
  static cloneComponent(source: Component, target: Component): void {
    const cloneInfo = CloneModeManager._cloneModeMap.get((<Object>source).constructor);
    for (const k in source) {
      const cloneMode = cloneInfo[k];
      switch (cloneMode) {
        case undefined:
        case CloneMode.Shallow:
          target[k] = source[k];
          break;
        case CloneMode.Deep:
          const prop = <Object>source[k];
          if (prop) {
            const propType = prop.constructor;
            if (propType === Object) {
              // Object
              let tarProp = target[k];
              tarProp || (tarProp = target[k] = {});
              Object.assign(tarProp, prop);
            } else if (propType === Array) {
              // Array
              let tarProp = <any[]>target[k];
              if (tarProp) {
                const arrayProp = <any[]>prop;
                const length = arrayProp.length;
                tarProp.length = length;
                for (let i = 0; i < length; i++) {
                  tarProp[i] = arrayProp[i];
                }
              } else {
                target[k] = (<any[]>prop).slice();
              }
            } else {
              // Class implements Iclone
              if (prop) {
                source[k].cloneTo(prop);
              } else {
                target[k] = source[k].clone();
              }
            }
          } else {
            // Null or undefine
            target[k] = prop;
          }
          break;
      }
    }
  }
}
