import {
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  Color,
  Matrix,
  Matrix3x3,
  Plane,
  Quaternion,
  Rect,
  SphericalHarmonics3,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine-math";
import { TypedArray } from "../base/Constant";
import { Logger } from "../base/Logger";
import { ICustomClone } from "./ComponentCloner";
import { CloneMode } from "./enums/CloneMode";

/**
 * Property decorator — deep clone this field, overriding the value type's default clone mode.
 * Field-level decorators have the highest priority.
 */
export function deepClone(target: Object, propertyKey: string): void {
  CloneManager._registerFieldMode(target, propertyKey, CloneMode.Deep);
}

/**
 * Property decorator — assign (share the reference) this field, overriding the value type's default clone mode.
 */
export function assignmentClone(target: Object, propertyKey: string): void {
  CloneManager._registerFieldMode(target, propertyKey, CloneMode.Assignment);
}

/**
 * Property decorator — ignore this field when cloning; keep the clone's own constructor-built value.
 */
export function ignoreClone(target: Object, propertyKey: string): void {
  CloneManager._registerFieldMode(target, propertyKey, CloneMode.Ignore);
}

/**
 * @deprecated Shallow clone is no longer a distinct mode; treated as deep clone.
 */
export function shallowClone(target: Object, propertyKey: string): void {
  CloneManager._registerFieldMode(target, propertyKey, CloneMode.Deep);
}

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
  /** @internal Own field-level clone modes per class (excluding inherited), from `@deepClone`/`@assignmentClone`/`@ignoreClone`. */
  static _subFieldModeMap = new Map<Object, Map<string, CloneMode>>();
  /** @internal Flattened field-level clone modes per class (across the prototype chain), cached. */
  static _fieldModeMap = new Map<Object, Map<string, CloneMode>>();

  private static _objectType = Object.getPrototypeOf(Object);

  /**
   * @internal
   * Register a field-level clone mode (highest priority — overrides the value type's `@defaultCloneMode`).
   */
  static _registerFieldMode(target: Object, propertyKey: string, mode: CloneMode): void {
    let fields = CloneManager._subFieldModeMap.get(target.constructor);
    if (!fields) {
      fields = new Map<string, CloneMode>();
      CloneManager._subFieldModeMap.set(target.constructor, fields);
    }
    fields.set(propertyKey, mode);
    CloneManager._fieldModeMap.clear();
  }

  /**
   * Get the field-level clone modes of a type, flattened across its prototype chain.
   */
  static getFieldModes(type: Function): Map<string, CloneMode> {
    let modes = CloneManager._fieldModeMap.get(type);
    if (!modes) {
      modes = new Map<string, CloneMode>();
      CloneManager._fieldModeMap.set(type, modes);
      const objectType = CloneManager._objectType;
      const subMap = CloneManager._subFieldModeMap;
      let current = type;
      while (current !== objectType) {
        const own = subMap.get(current);
        if (own) {
          own.forEach((mode, key) => {
            if (!modes.has(key)) modes.set(key, mode);
          });
        }
        current = Object.getPrototypeOf(current);
      }
    }
    return modes;
  }

  static copyProperty(source: Object, target: Object, k: string | number, cloneMap: Map<Object, Object>): void {
    target[k] = CloneManager._cloneValue(source[k], target[k], cloneMap);
  }

  /**
   * @internal
   * Clone gate — decides how to clone one value based on its type.
   */
  static _cloneValue(
    value: any,
    reuse: any,
    cloneMap: Map<Object, Object>,
    fieldMode?: CloneMode,
    srcRoot?: any,
    targetRoot?: any
  ): any {
    if (!(value instanceof Object)) return value;
    if (typeof value === "function") return reuse;

    // Mode priority: field decorator (highest) → container default deep → type's `@defaultCloneMode` → Assignment.
    let cloneMode = fieldMode;
    if (cloneMode === undefined) {
      if (
        Array.isArray(value) ||
        value instanceof Map ||
        value instanceof Set ||
        ArrayBuffer.isView(value) ||
        value.constructor === Object
      ) {
        cloneMode = CloneMode.Deep;
      } else {
        cloneMode = (<ICustomClone>value)._defaultCloneMode ?? CloneMode.Assignment;
      }
    }

    if (cloneMode === CloneMode.Ignore) return reuse;
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
    return CloneManager._deepClone(value, reuse, cloneMap, srcRoot, targetRoot);
  }

  /**
   * Deep-clone one object graph. Cycles / shared sub-graphs dedup through the identity map.
   * `srcRoot`/`targetRoot` are threaded to `_cloneTo` hooks that remap entity/component references.
   */
  private static _deepClone(
    value: any,
    reuse: any,
    cloneMap: Map<Object, Object>,
    srcRoot?: any,
    targetRoot?: any
  ): any {
    const existing = cloneMap.get(value);
    if (existing) return existing;

    // Value type (Vector3, Color, Matrix, ...) — copy in place.
    if ((<ICustomClone>value).copyFrom) {
      const dst =
        reuse && reuse !== value && reuse.constructor === value.constructor ? reuse : new (<any>value.constructor)();
      cloneMap.set(value, dst);
      (<ICustomClone>dst).copyFrom(<ICustomClone>value);
      (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst, srcRoot, targetRoot);
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
        dst[i] = CloneManager._cloneValue(value[i], undefined, cloneMap, undefined, srcRoot, targetRoot);
      }
      return dst;
    }

    // Map
    if (value instanceof Map) {
      const dst = new Map<any, any>();
      cloneMap.set(value, dst);
      value.forEach((v, key) => {
        dst.set(
          CloneManager._cloneValue(key, undefined, cloneMap, undefined, srcRoot, targetRoot),
          CloneManager._cloneValue(v, undefined, cloneMap, undefined, srcRoot, targetRoot)
        );
      });
      return dst;
    }

    // Set
    if (value instanceof Set) {
      const dst = new Set<any>();
      cloneMap.set(value, dst);
      value.forEach((v) => dst.add(CloneManager._cloneValue(v, undefined, cloneMap, undefined, srcRoot, targetRoot)));
      return dst;
    }

    // Object — reuse or construct, then populate all fields (opt-out) + finalize.
    const dst =
      reuse && reuse !== value && reuse.constructor === value.constructor ? reuse : new (<any>value.constructor)();
    cloneMap.set(value, dst);
    const fieldModes = CloneManager.getFieldModes(value.constructor);
    for (const key in value) {
      const fieldMode = fieldModes.get(key);
      if (fieldMode === CloneMode.Ignore) continue;
      dst[key] = CloneManager._cloneValue(value[key], dst[key], cloneMap, fieldMode, srcRoot, targetRoot);
    }
    (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst, srcRoot, targetRoot);
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

// Built-in default clone mode for math value types. The math package cannot depend on core's
// `@defaultCloneMode`, so they are registered here instead (core → math is the normal dependency
// direction). All are value-semantic and always deep cloned.
const _markDeep = defaultCloneMode(CloneMode.Deep);
[
  Vector2,
  Vector3,
  Vector4,
  Quaternion,
  Matrix,
  Matrix3x3,
  Color,
  Rect,
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  Plane,
  SphericalHarmonics3
].forEach((type) => _markDeep(type));
