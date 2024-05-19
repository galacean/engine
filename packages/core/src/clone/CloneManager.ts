import { Entity } from "../Entity";
import { TypedArray } from "../base/Constant";
import { IComponentCustomClone, ICustomClone } from "./ComponentCloner";
import { CloneMode } from "./enums/CloneMode";

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
 * If Class is encountered during the deep cloning process, the custom cloning function of the object will be called first.
 * Custom cloning requires the object to implement the IClone interface.
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

  private static _objectType = Object.getPrototypeOf(Object);

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
      const objectType = CloneManager._objectType;
      const cloneModeMap = CloneManager._subCloneModeMap;
      while (type !== objectType) {
        const subCloneModes = cloneModeMap.get(type);
        if (subCloneModes) {
          Object.assign(cloneModes, subCloneModes);
        }
        type = Object.getPrototypeOf(type);
      }
    }
    return cloneModes;
  }

  static cloneProperty(
    source: Object,
    target: Object,
    k: string | number,
    cloneMode: CloneMode,
    srcRoot: Entity,
    targetRoot: Entity,
    deepInstanceMap: Map<Object, Object>
  ): void {
    if (cloneMode === CloneMode.Ignore) {
      return;
    }

    const sourceProperty = source[k];
    if (sourceProperty instanceof Object) {
      if (cloneMode === undefined || cloneMode === CloneMode.Assignment) {
        target[k] = sourceProperty;
        return;
      }

      const type = sourceProperty.constructor;
      switch (type) {
        case Uint8Array:
        case Uint16Array:
        case Uint32Array:
        case Int8Array:
        case Int16Array:
        case Int32Array:
        case Float32Array:
        case Float64Array:
          let targetPropertyT = <TypedArray>target[k];
          if (targetPropertyT == null || targetPropertyT.length !== (<TypedArray>sourceProperty).length) {
            target[k] = (<TypedArray>sourceProperty).slice();
          } else {
            targetPropertyT.set(<TypedArray>sourceProperty);
          }
          break;
        case Array:
          let targetPropertyA = <Array<any>>target[k];
          const length = (<Array<any>>sourceProperty).length;
          if (targetPropertyA == null) {
            target[k] = targetPropertyA = new Array<any>(length);
          } else {
            targetPropertyA.length = length;
          }
          for (let i = 0; i < length; i++) {
            CloneManager.cloneProperty(
              <Array<any>>sourceProperty,
              targetPropertyA,
              i,
              cloneMode,
              srcRoot,
              targetRoot,
              deepInstanceMap
            );
          }
          break;
        default:
          let targetProperty = <Object>target[k];

          // If the target property is null, create new instance and keep reference sharing like the source
          if (!targetProperty) {
            if (!deepInstanceMap.has(sourceProperty)) {
              targetProperty = new sourceProperty.constructor();
              deepInstanceMap.set(sourceProperty, targetProperty);

              // Use hard code to clone
              if ((<ICustomClone>sourceProperty).copyFrom) {
                (<ICustomClone>targetProperty).copyFrom(<ICustomClone>sourceProperty);
              } else {
                const cloneModes = CloneManager.getCloneMode(sourceProperty.constructor);
                for (let k in sourceProperty) {
                  CloneManager.cloneProperty(
                    <Object>sourceProperty,
                    targetProperty,
                    k,
                    cloneModes[k],
                    srcRoot,
                    targetRoot,
                    deepInstanceMap
                  );
                }
              }

              // Custom clone
              if ((<IComponentCustomClone>sourceProperty)._cloneTo) {
                (<IComponentCustomClone>sourceProperty)._cloneTo(
                  <IComponentCustomClone>targetProperty,
                  srcRoot,
                  targetRoot
                );
              }
            } else {
              targetProperty = deepInstanceMap.get(sourceProperty);
            }
            target[k] = targetProperty;
          }

          break;
      }
    } else {
      // null, undefined, primitive type, function
      target[k] = sourceProperty;
    }
  }

  static deepCloneObject(source: Object, target: Object, deepInstanceMap: Map<Object, Object>): void {
    for (let k in source) {
      CloneManager.cloneProperty(source, target, k, CloneMode.Deep, null, null, deepInstanceMap);
    }
  }
}
