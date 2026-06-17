import { TypedArray } from "../base/Constant";
import { Logger } from "../base/Logger";
import { ICustomClone } from "./ComponentCloner";
import { CloneMode } from "./enums/CloneMode";

/**
 * Property decorator, ignore the property when cloning.
 */
export function ignoreClone(target: Object, propertyKey: string): void {
  let fields = CloneManager._subIgnoreMap.get(target.constructor);
  if (!fields) {
    fields = new Set<string>();
    CloneManager._subIgnoreMap.set(target.constructor, fields);
  }
  fields.add(propertyKey);
  CloneManager._ignoreMap.clear();
}

/**
 * @deprecated No longer needed — Assignment is the default clone behavior for unrecognized types.
 * Kept for backward compatibility; acts as a no-op.
 */
export function assignmentClone(_target: Object, _propertyKey: string): void {}

/**
 * @deprecated Use `@defaultCloneMode(CloneMode.Deep)` on the class instead.
 * Kept for backward compatibility; acts as a no-op.
 */
export function shallowClone(_target: Object, _propertyKey: string): void {}

/**
 * @deprecated Use `@defaultCloneMode(CloneMode.Deep)` on the class instead.
 * Kept for backward compatibility; acts as a no-op.
 */
export function deepClone(_target: Object, _propertyKey: string): void {}

/**
 * Class decorator that sets the default clone mode for instances of the decorated type.
 *
 * When a field holds an instance of a type decorated with `@defaultCloneMode`, the clone system
 * uses the specified mode instead of the default Assignment behavior.
 *
 * Built-in defaults:
 * - Entity / Component → `CloneMode.Remap`
 * - ReferResource (Texture, Mesh, Material, etc.) → `CloneMode.Assignment`
 * - Value-semantic config objects (RenderState, ParticleModule, etc.) → `CloneMode.Deep`
 *
 * @param mode - The clone mode applied to instances of the decorated type
 */
export function defaultCloneMode(mode: CloneMode) {
  return function (target: Function): void {
    Object.defineProperty(target.prototype, "_defaultCloneMode", { value: mode });
  };
}

/**
 * @internal
 * Clone manager.
 *
 * Opt-out model: all enumerable fields of an object are cloned unless marked `@ignoreClone`.
 * HOW each field value is cloned depends on the value's runtime type (`@defaultCloneMode`):
 *   - primitive / null / undefined → assign by value.
 *   - function → skipped (transient; the clone's constructor re-establishes bound handlers).
 *   - Remap (Entity / Component) → resolve to the clone via the identity map.
 *   - Assignment (ReferResource / unknown types without @defaultCloneMode) → share the reference.
 *   - Deep (@defaultCloneMode(Deep) / copyFrom types) → recursively deep clone.
 *
 * Deep clone lifecycle (3-stage):
 *   1. Construct — reuse the clone's existing slot value if same type, else `new ctor()`.
 *   2. Populate — `copyFrom` (value-type fast path) OR recurse all fields (opt-out).
 *   3. Finalize — `_cloneTo` post-clone hook for native sync / derived state rebuild.
 *
 * Cycles / shared sub-graphs dedup through the identity map.
 */
export class CloneManager {
  /** @internal Own `@ignoreClone` field names per class (excluding inherited). */
  static _subIgnoreMap = new Map<Object, Set<string>>();
  /** @internal Flattened `@ignoreClone` field names per class (across the prototype chain), cached. */
  static _ignoreMap = new Map<Object, Set<string>>();

  private static _objectType = Object.getPrototypeOf(Object);

  /**
   * Get the ignored field names of a type, flattened across its prototype chain.
   */
  static getIgnoredFields(type: Function): Set<string> {
    let fields = CloneManager._ignoreMap.get(type);
    if (!fields) {
      fields = new Set<string>();
      CloneManager._ignoreMap.set(type, fields);
      const objectType = CloneManager._objectType;
      const subMap = CloneManager._subIgnoreMap;
      let current = type;
      while (current !== objectType) {
        const own = subMap.get(current);
        if (own) {
          own.forEach((field) => fields.add(field));
        }
        current = Object.getPrototypeOf(current);
      }
    }
    return fields;
  }

  static copyProperty(source: Object, target: Object, k: string | number, cloneMap: Map<Object, Object>): void {
    target[k] = CloneManager._cloneValue(source[k], target[k], cloneMap);
  }

  /**
   * @internal
   * Clone gate — decides how to clone one value based on its type.
   */
  static _cloneValue(value: any, reuse: any, cloneMap: Map<Object, Object>): any {
    if (!(value instanceof Object)) return value;
    if (typeof value === "function") return reuse;

    const cloneMode = (<ICustomClone>value)._defaultCloneMode ?? CloneMode.Assignment;
    if (cloneMode === CloneMode.Assignment) {
      const reusedResource = <{ _addReferCount?(count: number): void; refCount?: number }>reuse;
      if (reusedResource?._addReferCount) {
        const presetRefCount = reusedResource.refCount;
        presetRefCount !== undefined &&
          presetRefCount <= 0 &&
          Logger.error(
            `CloneManager: the clone's preset ${reuse.constructor.name} holds no owned reference; ` +
              `a constructor presetting a ref-counted resource must acquire it (assign via its setter or an explicit +1).`
          );
        reusedResource._addReferCount(-1);
      }
      (<{ _addReferCount?(count: number): void }>value)._addReferCount?.(1);
      return value;
    }
    if (cloneMode === CloneMode.Remap) {
      return cloneMap.get(value) ?? value;
    }
    return CloneManager._deepClone(value, reuse, cloneMap);
  }

  /**
   * Deep-clone one object graph. Cycles / shared sub-graphs dedup through the identity map.
   */
  private static _deepClone(value: any, reuse: any, cloneMap: Map<Object, Object>): any {
    const existing = cloneMap.get(value);
    if (existing) return existing;

    // Value type (Vector3, Color, Matrix, ...) — copy in place.
    if ((<ICustomClone>value).copyFrom) {
      const dst =
        reuse && reuse !== value && reuse.constructor === value.constructor ? reuse : new (<any>value.constructor)();
      cloneMap.set(value, dst);
      (<ICustomClone>dst).copyFrom(<ICustomClone>value);
      (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst);
      return dst;
    }

    // Typed array — buffer copy.
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      const src = <TypedArray>value;
      if (reuse && reuse.constructor === src.constructor && (<TypedArray>reuse).length === src.length) {
        (<TypedArray>reuse).set(src);
        return reuse;
      }
      return src.slice();
    }

    // Array — fresh instance, each member through the gate.
    if (Array.isArray(value)) {
      const dst = new Array(value.length);
      cloneMap.set(value, dst);
      for (let i = 0, n = value.length; i < n; i++) {
        dst[i] = CloneManager._cloneValue(value[i], undefined, cloneMap);
      }
      return dst;
    }

    // Map
    if (value instanceof Map) {
      const dst = new Map<any, any>();
      cloneMap.set(value, dst);
      value.forEach((v, key) => {
        dst.set(CloneManager._cloneValue(key, undefined, cloneMap), CloneManager._cloneValue(v, undefined, cloneMap));
      });
      return dst;
    }

    // Set
    if (value instanceof Set) {
      const dst = new Set<any>();
      cloneMap.set(value, dst);
      value.forEach((v) => dst.add(CloneManager._cloneValue(v, undefined, cloneMap)));
      return dst;
    }

    // Object — reuse or construct, then populate all fields (opt-out) + finalize.
    const dst =
      reuse && reuse !== value && reuse.constructor === value.constructor ? reuse : new (<any>value.constructor)();
    cloneMap.set(value, dst);
    const ignoredFields = CloneManager.getIgnoredFields(value.constructor);
    for (const key in value) {
      if (ignoredFields.has(key)) continue;
      dst[key] = CloneManager._cloneValue(value[key], dst[key], cloneMap);
    }
    (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst);
    return dst;
  }

  /**
   * Copy every enumerable property of `source` into `target`, deep-cloning each value through
   * the type-driven gate.
   */
  static copyProperties(source: Object, target: Object, cloneMap: Map<Object, Object>): void {
    for (let k in source) {
      CloneManager.copyProperty(source, target, k, cloneMap);
    }
  }

  /**
   * Deep clone all fields of source into target (bypasses ignore check).
   */
  static deepCloneObject(source: Object, target: Object, cloneMap: Map<Object, Object>): void {
    for (let k in source) {
      target[k] = CloneManager._cloneValue(source[k], target[k], cloneMap);
    }
  }
}
