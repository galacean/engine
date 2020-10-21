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
 * 深克隆,适用于 Obect、Array 和 Class 类型。
 * Class 会调用对象的 cloneTo() 实现克隆，需要对象实现 IClone 接口。
 * @remarks 如果深克隆过程遇到 ReferenceObject 则使用浅拷贝。
 */
export function shallowClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Shallow);
}

/**
 * @internal
 * 克隆管理员。
 */
export class CloneManager {
  /** @internal */
  static _cloneModeMap = new Map<Object, Object>();

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
}
