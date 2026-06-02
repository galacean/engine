import { TypedArray } from "../base/Constant";
import { ICustomClone } from "./ComponentCloner";
import { CloneMode } from "./enums/CloneMode";

/**
 * Property decorator. Marks a field as a managed property of the type — it participates in
 * cloning. HOW it is cloned is decided by the field's runtime type + the type's `@defaultCloneMode`
 * (Entity / Component → Remap, ReferResource / interned flyweights → Assignment, otherwise → deep
 * clone). Opt-in: an unmarked field is not cloned.
 */
export function property(target: Object, propertyKey: string): void {
  let fields = CloneManager._subPropertyMap.get(target.constructor);
  if (!fields) {
    fields = new Set<string>();
    CloneManager._subPropertyMap.set(target.constructor, fields);
  }
  fields.add(propertyKey);
}

/**
 * @internal
 * Class decorator. Sets the default clone mode for instances of the decorated type, used when a field
 * holding such an instance is cloned (HOW is type-driven, not per field).
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
 * Opt-in model: a class instance clones only the fields marked `@property`; HOW each is cloned is
 * decided by the field's runtime type, not per field:
 *   - primitive / null / undefined → assign by value.
 *   - function → skipped (transient; the clone's constructor re-establishes bound handlers).
 *   - object → the type's default clone mode (`@defaultCloneMode`):
 *       Remap (Entity / Component) → resolve to the clone via the identity map (`cloneMap.get(x) ?? x`);
 *         refs outside the cloned subtree are absent and kept as-is.
 *       Assignment (ReferResource assets + interned flyweights) → share the reference; a ref-counted
 *         resource gets +1 (balanced by the clone's own destroy).
 *       no default → deep clone.
 *
 * Deep clone:
 *   - Containers: TypedArray → buffer copy; Array / Map / Set → new container, each member cloned
 *     through the gate (deep / remap / share).
 *   - Plain object (`constructor === Object`) → clone every entry (data dictionary).
 *   - Class instance — 3-stage lifecycle:
 *       1. Construct — reuse `target[k]` if it already holds an independent same-type instance,
 *          else `new ctor()`. A cloneable class must be parameterless-constructible (do real init
 *          in `_cloneTo` / lifecycle, not the constructor).
 *       2. Populate  — `copyFrom` (value-type fast path) OR recurse its own `@property` fields.
 *       3. Finalize  — `_cloneTo` post-clone hook, ALWAYS runs after populate (native sync, refcount,
 *          update-flag, derived state, cache rebuild). Equivalent to Unreal's PostDuplicate.
 *
 * Cycles / shared sub-graphs dedup through the same identity map.
 */
export class CloneManager {
  /** @internal Own `@property` field names per class (excluding inherited). */
  static _subPropertyMap = new Map<Object, Set<string>>();
  /** @internal Flattened `@property` field names per class (across the prototype chain), cached. */
  static _propertyMap = new Map<Object, Set<string>>();

  private static _objectType = Object.getPrototypeOf(Object);

  /**
   * Get the property field names of a type, flattened across its prototype chain.
   */
  static getProperties(type: Function): Set<string> {
    let fields = CloneManager._propertyMap.get(type);
    if (!fields) {
      fields = new Set<string>();
      CloneManager._propertyMap.set(type, fields);
      const objectType = CloneManager._objectType;
      const subMap = CloneManager._subPropertyMap;
      while (type !== objectType) {
        const own = subMap.get(type);
        if (own) {
          own.forEach((field) => fields.add(field));
        }
        type = Object.getPrototypeOf(type);
      }
    }
    return fields;
  }

  static cloneProperty(source: Object, target: Object, k: string | number, cloneMap: Map<Object, Object>): void {
    target[k] = CloneManager._cloneValue(source[k], target[k], cloneMap);
  }

  /**
   * Clone one value through the classify gate and return the clone.
   *
   * `reuse` is the clone's existing slot value: a pre-allocated same-type instance to reuse (e.g. a
   * constructor-created Vector3, or a container to refill in place), or the value to keep for
   * function / transient members. Pass `undefined` for container members that have no target slot.
   */
  private static _cloneValue(value: any, reuse: any, cloneMap: Map<Object, Object>): any {
    if (!(value instanceof Object)) return value;
    // Functions are transient (bound handlers the clone re-establishes in its constructor) — keep the
    // clone's own, never copy the source's.
    if (typeof value === "function") return reuse;

    // HOW is decided purely by the value's type.
    const cloneMode = (<ICustomClone>value)._defaultCloneMode ?? CloneMode.Deep;
    if (cloneMode === CloneMode.Assignment) {
      // Shared reference: a new holder now points at the resource, so bump its ref count (no-op for
      // non-ref-counted flyweights). The clone releases it on destroy, keeping the count balanced.
      (<{ _addReferCount?(count: number): void }>value)._addReferCount?.(1);
      return value;
    }
    if (cloneMode === CloneMode.Remap) {
      // Entity / Component reference → resolve to its clone; refs outside the cloned subtree are
      // absent from the map and kept unchanged.
      return cloneMap.get(value) ?? value;
    }

    // Deep clone. Cycles / shared sub-graphs dedup through the identity map.
    const existing = cloneMap.get(value);
    if (existing) return existing;

    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      const src = <TypedArray>value;
      if (reuse && reuse.constructor === src.constructor && (<TypedArray>reuse).length === src.length) {
        (<TypedArray>reuse).set(src);
        return reuse;
      }
      return src.slice();
    }
    if (Array.isArray(value)) {
      const dst: any[] = Array.isArray(reuse) ? reuse : new Array(value.length);
      dst.length = value.length;
      cloneMap.set(value, dst);
      for (let i = 0, n = value.length; i < n; i++) {
        dst[i] = CloneManager._cloneValue(value[i], dst[i], cloneMap);
      }
      return dst;
    }
    if (value instanceof Map) {
      const dst: Map<any, any> = reuse instanceof Map ? (reuse.clear(), reuse) : new Map<any, any>();
      cloneMap.set(value, dst);
      value.forEach((v, key) => {
        dst.set(CloneManager._cloneValue(key, undefined, cloneMap), CloneManager._cloneValue(v, undefined, cloneMap));
      });
      return dst;
    }
    if (value instanceof Set) {
      const dst: Set<any> = reuse instanceof Set ? (reuse.clear(), reuse) : new Set<any>();
      cloneMap.set(value, dst);
      value.forEach((v) => dst.add(CloneManager._cloneValue(v, undefined, cloneMap)));
      return dst;
    }

    // Object — 3-stage lifecycle.
    // 1. Construct: reuse a pre-allocated same-type instance, else `new ctor()`. A cloneable class must
    //    be parameterless-constructible — do real init in `_cloneTo` / lifecycle, not the constructor
    //    (cf. UE / Unity / Cocos).
    const dst =
      reuse && reuse !== value && reuse.constructor === value.constructor ? reuse : new (<any>value.constructor)();
    cloneMap.set(value, dst);
    // 2. Populate: copyFrom fast path for value types (Vector3, Color, Matrix, ...); a plain object
    //    clones every entry; a class instance clones only its own `@property` fields.
    if ((<ICustomClone>value).copyFrom) {
      (<ICustomClone>dst).copyFrom(<ICustomClone>value);
    } else if (value.constructor === Object) {
      for (const key in value) {
        dst[key] = CloneManager._cloneValue(value[key], dst[key], cloneMap);
      }
    } else {
      CloneManager.getProperties(value.constructor).forEach((key) => {
        dst[key] = CloneManager._cloneValue(value[key], dst[key], cloneMap);
      });
    }
    // 3. Finalize: post-clone side-effect hook.
    (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst, cloneMap);
    return dst;
  }

  /**
   * Deep clone every enumerable field of `source` into `target` (type-driven per field). Explicit
   * deep-copy helper for objects outside the opt-in `@property` system (e.g. ShaderMacroCollection).
   */
  static deepCloneObject(source: Object, target: Object, cloneMap: Map<Object, Object>): void {
    for (let k in source) {
      CloneManager.cloneProperty(source, target, k, cloneMap);
    }
  }
}
