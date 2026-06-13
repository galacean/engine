import { TypedArray } from "../base/Constant";
import { Logger } from "../base/Logger";
import { ICustomClone } from "./ComponentCloner";
import { CloneMode } from "./enums/CloneMode";

/**
 * Property decorator. Marks a field as a managed property of the type — it participates in
 * cloning. HOW it is cloned is decided by the field's runtime type + the type's `@defaultCloneMode`
 * (Entity / Component → Remap, ReferResource / interned flyweights → Assignment, otherwise → deep
 * clone). Opt-in: an unmarked field is not cloned.
 *
 * Contracts a `@property` field imposes on the types it can hold:
 * - A deep-cloned class (no `@defaultCloneMode`) must be parameterless-constructible — the
 *   Construct stage builds an empty shell with `new ctor()` (no reuse exists for container
 *   members); state is restored by the Populate stage / `_cloneTo`.
 * - A constructor that presets a ref-counted resource into a `@property` slot must own a
 *   reference for it (assign via its setter or an explicit +1): the clone gate releases the
 *   slot's old value when overwriting it with the source's.
 */
export function property(target: Object, propertyKey: string): void {
  let fields = CloneManager._subPropertyMap.get(target.constructor);
  if (!fields) {
    fields = new Set<string>();
    CloneManager._subPropertyMap.set(target.constructor, fields);
  }
  fields.add(propertyKey);
  // A new registration extends this class AND every subclass; the affected subclass set is
  // unknown here, so drop all flattened sets (registration is a cold path, rebuild is lazy).
  CloneManager._propertyMap.clear();
}

/**
 * Class decorator that sets the default clone mode for instances of the decorated type — applied when
 * an undecorated field holds such an instance. Built-in defaults: Entity / Component → `Remap`,
 * ReferResource → `Assignment`. Use it on a custom type that should be shared (not deep cloned) when
 * it appears inside a cloned object.
 *
 * @param mode - The clone mode applied to instances of the decorated type
 *
 * @example
 * ```ts
 * @defaultCloneMode(CloneMode.Assignment)
 * class MySharedAsset {}
 * ```
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

  static copyProperty(source: Object, target: Object, k: string | number, cloneMap: Map<Object, Object>): void {
    target[k] = CloneManager._cloneValue(source[k], target[k], cloneMap);
  }

  /**
   * Decide how to clone one value (the gate — does no recursion itself):
   *   - primitive / null / undefined → by value.
   *   - function → keep the clone's own (transient; re-established by its constructor).
   *   - Assignment → share the source reference. For a ref-counted resource, release the clone's reused
   *     slot value (its constructor-preset default) and acquire the source — net-balanced by the clone's
   *     own destroy; no-op for non-ref-counted flyweights.
   *   - Remap → resolve an Entity / Component to its clone via the identity map; refs outside the
   *     cloned subtree are kept as-is.
   *   - otherwise → deep clone.
   *
   * `reuse` is the clone's existing slot value, reused in place for value types / typed arrays so any
   * constructor-bound callbacks survive; pass `undefined` when there is no slot.
   */
  private static _cloneValue(value: any, reuse: any, cloneMap: Map<Object, Object>): any {
    if (!(value instanceof Object)) return value;
    if (typeof value === "function") return reuse;

    const cloneMode = (<ICustomClone>value)._defaultCloneMode ?? CloneMode.Deep;
    if (cloneMode === CloneMode.Assignment) {
      const reusedResource = <{ _addReferCount?(count: number): void; refCount?: number }>reuse;
      if (reusedResource?._addReferCount) {
        // The slot's old value must own one reference (see the `@property` contract): a constructor
        // preset that skipped the +1 would get its count corrupted here and be released early.
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
   * Deep-clone one object graph. Cycles / shared sub-graphs dedup through the identity map; every
   * member recurses back through {@link _cloneValue}.
   */
  private static _deepClone(value: any, reuse: any, cloneMap: Map<Object, Object>): any {
    const existing = cloneMap.get(value);
    if (existing) return existing;

    // Value type (Vector3, Color, Matrix, ...) — copy in place into the reused instance so its
    // constructor-bound callbacks survive.
    if ((<ICustomClone>value).copyFrom) {
      const dst =
        reuse && reuse !== value && reuse.constructor === value.constructor ? reuse : new (<any>value.constructor)();
      cloneMap.set(value, dst);
      (<ICustomClone>dst).copyFrom(<ICustomClone>value);
      (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst, cloneMap);
      return dst;
    }

    // Typed array — copy into the reused buffer when it fits, else a fresh slice.
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      const src = <TypedArray>value;
      if (reuse && reuse.constructor === src.constructor && (<TypedArray>reuse).length === src.length) {
        (<TypedArray>reuse).set(src);
        return reuse;
      }
      return src.slice();
    }

    // Container — always a fresh instance; every member recurses through the gate.
    if (Array.isArray(value)) {
      const dst = new Array(value.length);
      cloneMap.set(value, dst);
      for (let i = 0, n = value.length; i < n; i++) {
        dst[i] = CloneManager._cloneValue(value[i], undefined, cloneMap);
      }
      return dst;
    }
    if (value instanceof Map) {
      const dst = new Map<any, any>();
      cloneMap.set(value, dst);
      value.forEach((v, key) => {
        dst.set(CloneManager._cloneValue(key, undefined, cloneMap), CloneManager._cloneValue(v, undefined, cloneMap));
      });
      return dst;
    }
    if (value instanceof Set) {
      const dst = new Set<any>();
      cloneMap.set(value, dst);
      value.forEach((v) => dst.add(CloneManager._cloneValue(v, undefined, cloneMap)));
      return dst;
    }

    // Object — reuse a same-type instance else `new ctor()` (must be parameterless-constructible; do
    // real init in `_cloneTo` / lifecycle). A plain object clones every entry; a class clones its own
    // `@property` fields. Then run the post-clone hook.
    const dst =
      reuse && reuse !== value && reuse.constructor === value.constructor ? reuse : new (<any>value.constructor)();
    cloneMap.set(value, dst);
    if (value.constructor === Object) {
      for (const key in value) {
        dst[key] = CloneManager._cloneValue(value[key], dst[key], cloneMap);
      }
    } else {
      CloneManager.getProperties(value.constructor).forEach((key) => {
        dst[key] = CloneManager._cloneValue(value[key], dst[key], cloneMap);
      });
    }
    (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst, cloneMap);
    return dst;
  }

  /**
   * Copy every enumerable property of `source` into the pre-existing `target`, deep-cloning each
   * value through the type-driven gate (deep / share / remap). The opt-out helper for objects outside
   * the `@property` system (e.g. ShaderMacroCollection).
   */
  static copyProperties(source: Object, target: Object, cloneMap: Map<Object, Object>): void {
    for (let k in source) {
      CloneManager.copyProperty(source, target, k, cloneMap);
    }
  }
}
