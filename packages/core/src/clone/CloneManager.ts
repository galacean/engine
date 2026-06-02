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
 *       Assignment (ReferResource assets + interned flyweights) → share the reference.
 *       no default → deep clone.
 *
 * Deep clone:
 *   - Containers: TypedArray → buffer copy; Map / Set → new container + per-element remap;
 *     Array → recurse each element (type-driven).
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
    const sourceProperty = source[k];
    if (!(sourceProperty instanceof Object)) {
      target[k] = sourceProperty;
      return;
    }
    // Functions are transient (typically bound handlers the clone re-establishes in its own
    // constructor) — never cloned.
    if (typeof sourceProperty === "function") return;

    // HOW is decided purely by the value's type.
    const cloneMode = (<ICustomClone>sourceProperty)._defaultCloneMode ?? CloneMode.Deep;
    if (cloneMode === CloneMode.Assignment) {
      target[k] = sourceProperty;
      return;
    }
    if (cloneMode === CloneMode.Remap) {
      // Entity / Component reference → resolve to its clone; refs outside the cloned subtree are
      // absent from the map and kept unchanged.
      target[k] = cloneMap.get(sourceProperty) ?? sourceProperty;
      return;
    }

    if (ArrayBuffer.isView(sourceProperty) && !(sourceProperty instanceof DataView)) {
      const src = <TypedArray>sourceProperty;
      const dst = <TypedArray>target[k];
      if (dst == null || dst.length !== src.length) {
        target[k] = src.slice();
      } else {
        dst.set(src);
      }
    } else if (sourceProperty instanceof Map) {
      let dst = <Map<any, any>>target[k];
      if (dst == null) {
        target[k] = dst = new Map<any, any>();
      } else {
        dst.clear();
      }
      sourceProperty.forEach((value, key) => {
        dst.set(CloneManager._remapIfPossible(key, cloneMap), CloneManager._remapIfPossible(value, cloneMap));
      });
    } else if (sourceProperty instanceof Set) {
      let dst = <Set<any>>target[k];
      if (dst == null) {
        target[k] = dst = new Set<any>();
      } else {
        dst.clear();
      }
      sourceProperty.forEach((value) => {
        dst.add(CloneManager._remapIfPossible(value, cloneMap));
      });
    } else if (Array.isArray(sourceProperty)) {
      const length = sourceProperty.length;
      let dst = <Array<any>>target[k];
      if (dst == null) {
        target[k] = dst = new Array<any>(length);
      } else {
        dst.length = length;
      }
      for (let i = 0; i < length; i++) {
        CloneManager.cloneProperty(sourceProperty, dst, i, cloneMap);
      }
    } else {
      if (cloneMap.has(sourceProperty)) {
        target[k] = cloneMap.get(sourceProperty);
        return;
      }
      let dst = <Object>target[k];
      // Reuse a pre-allocated same-type instance on the target (e.g. a constructor-created Vector3);
      // otherwise construct via the parameterless constructor.
      // Contract: a cloneable class must be constructible with no arguments — do any real
      // initialization in `_cloneTo` / lifecycle hooks, not in the constructor (cf. UE / Unity / Cocos).
      const reuseTarget = dst && dst !== sourceProperty && dst.constructor === sourceProperty.constructor;
      if (!reuseTarget) {
        dst = new (<any>sourceProperty.constructor)();
        target[k] = dst;
      }
      cloneMap.set(sourceProperty, dst);
      // Populate: copyFrom fast path for value types (Vector3, Color, Matrix, ...); a plain object
      // clones every entry; a class instance clones only its own `@property` fields.
      if ((<ICustomClone>sourceProperty).copyFrom) {
        (<ICustomClone>dst).copyFrom(<ICustomClone>sourceProperty);
      } else if (sourceProperty.constructor === Object) {
        for (let key in sourceProperty) {
          CloneManager.cloneProperty(sourceProperty, dst, key, cloneMap);
        }
      } else {
        CloneManager.getProperties(sourceProperty.constructor).forEach((key) => {
          CloneManager.cloneProperty(sourceProperty, dst, key, cloneMap);
        });
      }
      // Finalize: post-clone side-effect hook — always runs after populate (see header doc)
      (<ICustomClone>sourceProperty)._cloneTo?.(<ICustomClone>dst, cloneMap);
    }
  }

  private static _remapIfPossible(value: any, cloneMap: Map<Object, Object>): any {
    if (value instanceof Object && (<ICustomClone>value)._defaultCloneMode === CloneMode.Remap) {
      return cloneMap.get(value) ?? value;
    }
    return value;
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
