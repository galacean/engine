import { CloneMode } from "./enums/CloneMode";

/**
 * 属性装饰器，克隆时对字段进行忽略。
 */
export function ignoreClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Ignore);
}

/**
 * 属性装饰器，克隆时对字段进行赋值克隆。
 * @remarks 如果是基本类型则会拷贝值，如果是引用类型则会拷贝其引用地址。
 */
export function assignmentClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Assignment);
}

/**
 * 属性装饰器，克隆时对字段进行浅克隆。
 * @remarks
 * 适用于 Obect、Array 和 Class 类型。
 * 保持引用独立并使用赋值的方式克隆内部所有字段（如果内部字段是基本类型则会拷贝值，如果内部字段是引用类型则会拷贝其引用地址）。
 */
export function shallowClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Shallow);
}

/**
 * 属性装饰器，克隆时对属性进行深克隆。
 * @remarks
 * 适用于 Obect、Array 和 Class 类型。
 * 如果在深克隆过程中遇到 Class 则会调用对象的 cloneTo() 实现克隆，需要对象实现 IClone 接口。
 */
export function deepClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Deep);
}

/**
 * @internal
 * 克隆管理员。
 */
export class CloneManager {
  /** @internal */
  static _subCloneModeMap = new Map<Object, Object>();
  /** @internal */
  static _cloneModeMap = new Map<Object, Object>();

  private static _obejctType = Object.getPrototypeOf(Object);

  /**
   * 注释克隆模式。
   * @param target - 克隆目标类型
   * @param propertyKey - 属性名称
   * @param mode - 克隆模式
   */
  static registerCloneMode(target: Object, propertyKey: string, mode: CloneMode): void {
    let targetMap = CloneManager._subCloneModeMap.get(target.constructor);
    if (!targetMap) {
      targetMap = Object.create(null);
      CloneManager._subCloneModeMap.set(target.constructor, targetMap);
    }
    targetMap[propertyKey] = mode;
  }

  /**
   * 根据原型链获取 CloneMode。
   */
  static getCloneModeMode(type: Function): Object {
    let cloneModes = CloneManager._cloneModeMap.get(type);
    if (!cloneModes) {
      cloneModes = Object.create(null);
      CloneManager._cloneModeMap.set(type, cloneModes);
      const obejctType = CloneManager._obejctType;
      const cloneModeMap = CloneManager._subCloneModeMap;
      while (type !== obejctType) {
        const subCloneModes = cloneModeMap.get(type);
        if (subCloneModes) {
          Object.assign(cloneModes, subCloneModes);
        }
        type = Object.getPrototypeOf(type);
      }
    }
    return cloneModes;
  }
}
