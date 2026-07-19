import { Entity } from "../Entity";
import { ReferResource } from "../asset/ReferResource";
import { TypedArray } from "../base/Constant";
import { ICustomClone } from "./ComponentCloner";
import { CloneMode } from "./enums/CloneMode";

/**
 * Property decorator, ignore the property when cloning.
 */
export function ignoreClone(target: object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Ignore);
}

/**
 * Property decorator, assign value to the property when cloning.
 *
 * @remarks
 * If it's a primitive type, the value will be copied.
 * If it's a class type, the reference will be copied.
 */
export function assignmentClone(target: object, propertyKey: string): void {
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
export function shallowClone(target: object, propertyKey: string): void {
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
export function deepClone(target: object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Deep);
}

/**
 * @internal
 * Clone manager.
 */
export class CloneManager {
  /** @internal */
  static _subCloneModeMap = new Map<object, object>();
  /** @internal */
  static _cloneModeMap = new Map<object, object>();

  private static _objectType = Object.getPrototypeOf(Object);

  /**
   * Register clone mode.
   * @param target - Clone target
   * @param propertyKey - Clone property name
   * @param mode - Clone mode
   */
  static registerCloneMode(target: object, propertyKey: string, mode: CloneMode): void {
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
  static getCloneMode(type: Function): object {
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
    source: object,
    target: object,
    k: string | number,
    cloneMode: CloneMode,
    srcRoot: Entity,
    targetRoot: Entity,
    deepInstanceMap: Map<object, object>
  ): void {
    const sourceProperty = source[k];

    // 1. Remappable references (Entity/Component) are always remapped, highest priority
    if (sourceProperty instanceof Object && (<ICustomClone>sourceProperty)._remap) {
      target[k] = (<ICustomClone>sourceProperty)._remap(srcRoot, targetRoot);
      return;
    }

    // 2. Explicit ignore
    if (cloneMode === CloneMode.Ignore) return;

    // 3. Primitives / null / undefined - direct assign
    if (!(sourceProperty instanceof Object)) {
      target[k] = sourceProperty;
      return;
    }

    // 4. Determine effective clone mode
    let effectiveCloneMode: CloneMode = cloneMode;
    if (effectiveCloneMode === undefined) {
      // Undecorated: infer from runtime type
      effectiveCloneMode = CloneManager._inferCloneMode(sourceProperty, target[k]);
    } else if (effectiveCloneMode !== CloneMode.Assignment) {
      // Decorated Shallow/Deep: upgrade to Deep if target already has independent same-type instance.
      // Assignment is never upgraded — it means the user explicitly wants a reference copy.
      const targetProperty = target[k];
      if (
        targetProperty &&
        targetProperty !== sourceProperty &&
        targetProperty.constructor === sourceProperty.constructor
      ) {
        effectiveCloneMode = CloneMode.Deep;
      }
    }

    // 5. Assignment - direct reference copy
    if (effectiveCloneMode === CloneMode.Assignment) {
      target[k] = sourceProperty;
      return;
    }

    // 6. Shallow/Deep clone for complex types
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
        const targetPropertyT = <TypedArray>target[k];
        if (targetPropertyT == null || targetPropertyT.length !== (<TypedArray>sourceProperty).length) {
          target[k] = (<TypedArray>sourceProperty).slice();
        } else {
          targetPropertyT.set(<TypedArray>sourceProperty);
        }
        break;
      case Map:
        let targetPropertyM = <Map<any, any>>target[k];
        if (targetPropertyM == null) {
          target[k] = targetPropertyM = new Map<any, any>();
        } else {
          targetPropertyM.clear();
        }
        (<Map<any, any>>sourceProperty).forEach((value, key) => {
          if (key instanceof Object && (<ICustomClone>key)._remap) {
            key = (<ICustomClone>key)._remap(srcRoot, targetRoot);
          }
          if (value instanceof Object && (<ICustomClone>value)._remap) {
            value = (<ICustomClone>value)._remap(srcRoot, targetRoot);
          }
          targetPropertyM.set(key, value);
        });
        break;
      case Set:
        let targetPropertyS = <Set<any>>target[k];
        if (targetPropertyS == null) {
          target[k] = targetPropertyS = new Set<any>();
        } else {
          targetPropertyS.clear();
        }
        (<Set<any>>sourceProperty).forEach((value) => {
          if (value instanceof Object && (<ICustomClone>value)._remap) {
            value = (<ICustomClone>value)._remap(srcRoot, targetRoot);
          }
          targetPropertyS.add(value);
        });
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
            cloneMode, // Pass original mode: decorated → children inherit, undecorated → children infer independently
            srcRoot,
            targetRoot,
            deepInstanceMap
          );
        }
        break;
      default:
        // Check if we've already visited this source object (cycle detection)
        if (deepInstanceMap.has(sourceProperty)) {
          target[k] = deepInstanceMap.get(sourceProperty);
          return;
        }

        let targetPropertyD = <object>target[k];
        if (!targetPropertyD) {
          targetPropertyD = new sourceProperty.constructor();
          target[k] = targetPropertyD;
        }
        deepInstanceMap.set(sourceProperty, targetPropertyD);

        if ((<ICustomClone>sourceProperty).copyFrom) {
          (<ICustomClone>targetPropertyD).copyFrom(<ICustomClone>sourceProperty);
        } else {
          const cloneModes = CloneManager.getCloneMode(sourceProperty.constructor);
          for (const k in sourceProperty) {
            CloneManager.cloneProperty(
              <object>sourceProperty,
              targetPropertyD,
              k,
              cloneModes[k],
              srcRoot,
              targetRoot,
              deepInstanceMap
            );
          }
          (<ICustomClone>sourceProperty)._cloneTo?.(<ICustomClone>targetPropertyD, srcRoot, targetRoot);
        }
        break;
    }
  }

  /**
   * Infer the appropriate clone mode for an undecorated property based on its runtime type.
   * This enables user custom scripts to get correct clone behavior without decorators.
   */
  private static _inferCloneMode(sourceProperty: object, targetProperty: any): CloneMode {
    // If target already has an independent instance of the same type,
    // deep clone to preserve isolation (e.g., constructor-created objects)
    if (
      targetProperty &&
      targetProperty !== sourceProperty &&
      targetProperty.constructor === sourceProperty.constructor
    ) {
      return CloneMode.Deep;
    }

    // Arrays need recursive processing (may contain Entity/Component refs)
    if (Array.isArray(sourceProperty)) return CloneMode.Deep;

    // TypedArrays - copy data
    if (ArrayBuffer.isView(sourceProperty)) return CloneMode.Deep;

    // Maps and Sets - create independent copies
    if (sourceProperty instanceof Map || sourceProperty instanceof Set) return CloneMode.Deep;

    // Value types with copyFrom (math types like Vector3, Color, etc.)
    if ((<ICustomClone>sourceProperty).copyFrom) return CloneMode.Deep;

    // Engine resources are reference-counted and shared. All other user/value
    // classes are cloned so prefab instances do not share mutable state.
    return sourceProperty instanceof ReferResource ? CloneMode.Assignment : CloneMode.Deep;
  }

  static deepCloneObject(source: object, target: object, deepInstanceMap: Map<object, object>): void {
    for (const k in source) {
      CloneManager.cloneProperty(source, target, k, CloneMode.Deep, null, null, deepInstanceMap);
    }
  }
}
