import { Component } from "../Component";
import { CloneMode } from "./enums/CloneMode";

/**
 * 属性装饰器，类克隆时对属性进行忽略。
 */
export function ignoreClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Ignore);
}

/**
 * 属性装饰器，类克隆时对属性进行深克隆。
 */
export function deepClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Deep);
}

/**
 * 属性装饰器，类克隆时对属性进行浅克隆。
 */
export function shallowClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Shallow);
}

/**
 * 类装饰器，深拷贝时使用浅拷贝的方式保持共享。
 */
export function shareType<TFunction extends Function>(target: TFunction): void {
  CloneManager.registerShareType(target);
}

/**
 * @internal
 * 克隆管理员。
 */
export class CloneManager {
  private static _shareTypeMap = new Set<Function>();
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
   * 注册共享类型。
   * @remarks 注册后该类型的在深拷贝时仍然使用浅拷贝的方式保持共享。
   * @param type - 类型
   */
  static registerShareType<TFunction extends Function>(type: TFunction): void {
    CloneManager._shareTypeMap.add(type);
  }

  /**
   * 克隆并返回克隆体。
   * @param source - 克隆源
   */
  static cloneComponent(source: Component, target: Component): void {
    const cloneInfo = CloneManager._cloneModeMap.get((<Object>source).constructor);
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
