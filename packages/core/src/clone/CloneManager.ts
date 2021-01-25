import { IClone } from "@oasis-engine/design";
import { CloneMode } from "./enums/CloneMode";

type TypeArray =
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Float32Array
  | Float64Array;

/**
 * Property decorator, ignore the property when cloning.
 */
export function ignoreClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Ignore);
}

/**
 * Property decorator, assign value to the property when cloning.
 *
 * @remarks
 * If it's a primitive type, the value will be copied.
 * If it's a class type, the reference will be copied.
 */
export function assignmentClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Assignment);
}

/**
 * Property decorator, shallow clone the property when cloning.
 * After cloning, it will keep its own reference independent, and use the method of assignment to clone all its internal properties.
 * if the internal property is a primitive type, the value will be copied, if the internal property is a reference type, its reference address will be copied.。
 *
 * @remarks
 * Applicable to Object, Array, TypedArray and Class types.
 */
export function shallowClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Shallow);
}

/**
 * Property decorator, deep clone the property when cloning.
 * After cloning, it will maintain its own reference independence, and all its internal deep properties will remain completely independent.
 *
 * @remarks
 * Applicable to Object, Array, TypedArray and Class types.
 * If Class is encountered during the deep cloning process, the custom cloning function of the object will be called first. Custom cloning requires the object to implement the IClone interface.
 */
export function deepClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Deep);
}

/**
 * @internal
 * Clone manager.
 */
export class CloneManager {
  /** @internal */
  static _subCloneModeMap = new Map<Object, Object>();
  /** @internal */
  static _cloneModeMap = new Map<Object, Object>();

  private static _obejctType = Object.getPrototypeOf(Object);

  /**
   * Register clone mode.
   * @param target - Clone target
   * @param propertyKey - Clone property name
   * @param mode - Clone mode
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
   * Get the clone mode according to the prototype chain.
   */
  static getCloneMode(type: Function): Object {
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

  /**
   * Deep clone the object.
   * @param source - Clone source
   * @param target - Clone target
   */
  static deepCloneObject(source: Object, target: Object): void {
    const type = source.constructor;
    switch (type) {
      case Uint8Array:
      case Uint16Array:
      case Uint32Array:
      case Int8Array:
      case Int16Array:
      case Int32Array:
      case Float32Array:
      case Float64Array:
        // Type array clone.
        (<TypeArray>target).set(<TypeArray>source);
        break;
      case Array:
        // Array clone.
        for (let i = 0, n = (<[]>source).length; i < n; i++) {
          CloneManager._deepCloneObjectItem(source, target, i);
        }
        break;
      default:
        const customSource = <IClone>source;
        if (customSource.clone && customSource.cloneTo) {
          // Custom clone.
          customSource.cloneTo(target);
        } else {
          // Object or other class not implments custom clone.
          const keys = Object.keys(source);
          for (let i = 0, n = keys.length; i < n; i++) {
            CloneManager._deepCloneObjectItem(source, target, keys[i]);
          }
        }
    }
  }

  private static _deepCloneObjectItem(source: object, target: object, k: number | string): void {
    const sourceItem = source[k];
    if (sourceItem instanceof Object) {
      const itemType = (<Object>sourceItem).constructor;
      switch (itemType) {
        case Uint8Array:
        case Uint16Array:
        case Uint32Array:
        case Int8Array:
        case Int16Array:
        case Int32Array:
        case Float32Array:
        case Float64Array:
          // Type array clone.
          const sourceTypeArrayItem = <TypeArray>sourceItem;
          let targetTypeArrayItem = <TypeArray>target[k];
          if (targetTypeArrayItem == null) {
            target[k] = sourceTypeArrayItem.slice();
          } else {
            targetTypeArrayItem.set(sourceTypeArrayItem);
          }
          break;
        case Array:
          // Array clone.
          const sourceArryItem = <[]>sourceItem;
          let targetArrayItem = <[]>target[k];
          if (targetArrayItem == null) {
            target[k] = new Array(sourceArryItem.length);
          } else {
            targetArrayItem.length = sourceArryItem.length;
          }
          CloneManager.deepCloneObject(sourceArryItem, targetArrayItem);
          break;
        default:
          if (sourceItem.clone && sourceItem.cloneTo) {
            // Custom clone.
            let sourceCustomItem = <IClone>sourceItem;
            let targetCustomItem = <IClone>target[k];
            if (targetCustomItem) {
              sourceCustomItem.cloneTo(targetCustomItem);
            } else {
              target[k] = sourceCustomItem.clone();
            }
          } else {
            // Object or other class not implments custom clone.
            let targetItem = <Object>target[k];
            targetItem == null && (target[k] = targetItem = new sourceItem.constructor());
            CloneManager.deepCloneObject(sourceItem, targetItem);
            break;
          }
      }
    } else {
      // Null or undefine and primitive type.
      target[k] = sourceItem;
    }
  }
}
