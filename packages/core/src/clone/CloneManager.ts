import { TypedArray } from "../base/Constant";
import { ICustomClone } from "./ComponentCloner";
import { CloneMode } from "./enums/CloneMode";

/**
 * Property decorator, ignore the property when cloning.
 */
export function ignoreClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Ignore);
}

/**
 * Property decorator, copy reference when cloning (no deep copy).
 */
export function assignmentClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Assignment);
}

/**
 * Property decorator, shallow clone the property when cloning.
 * Recreates the container, but inner properties are assigned by reference.
 */
export function shallowClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Shallow);
}

/**
 * Property decorator, deep clone the property when cloning.
 * Recursively clones the entire subtree.
 */
export function deepClone(target: Object, propertyKey: string): void {
  CloneManager.registerCloneMode(target, propertyKey, CloneMode.Deep);
}

/**
 * @internal
 * Clone manager.
 *
 * Per-field decision = a classify gate + (only for deep clone) a 3-stage lifecycle.
 *
 * Classify gate:
 *   - primitive / null / undefined → assign by value.
 *   - Explicit decorator wins: @ignoreClone → skip; @assignmentClone → share the reference
 *     as-is; @deepClone → deep clone.
 *   - Undecorated → the type's default clone mode (registered via @defaultCloneMode):
 *       CloneMode.Remap (Entity / Component) → resolve to the clone via the identity map
 *         (`cloneMap.get(x) ?? x`); refs outside the cloned subtree are absent and kept as-is.
 *       CloneMode.Assignment (ReferResource assets + interned flyweights: Shader, ShaderMacro,
 *         ShaderTagKey, SubFont) → share the reference.
 *       no registered default → deep clone.
 *   So e.g. @assignmentClone on an Entity field shares the source reference; the Remap default
 *   only applies when the field is undecorated.
 *
 * Deep clone:
 *   - Containers: TypedArray → buffer copy; Map / Set → new container + per-element remap;
 *     Array → recurse each element (re-dispatched through the gate as undecorated).
 *   - Object — 3-stage lifecycle:
 *       1. Construct — reuse `target[k]` if it already holds an independent same-type instance
 *          (preserves a clone target's pre-allocated field), else allocate a new instance.
 *       2. Populate  — `copyFrom` (value-type fast path) OR recurse fields per inner decorators.
 *       3. Finalize  — `_cloneTo` post-clone hook, ALWAYS runs after populate (independent of
 *          copyFrom): native sync (Collider), refcount (AudioSource), update-flag (Animator),
 *          derived state (SpriteRenderer), cache rebuild (SkinnedMeshRenderer _applySkin).
 *          Equivalent to Unreal's PostDuplicate.
 *
 * Cycles / shared sub-graphs dedup through the same identity map.
 */
export class CloneManager {
  /** @internal */
  static _subCloneModeMap = new Map<Object, Object>();
  /** @internal */
  static _cloneModeMap = new Map<Object, Object>();

  private static _objectType = Object.getPrototypeOf(Object);

  /**
   * Register clone mode.
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
    cloneMap: Map<Object, Object>
  ): void {
    const sourceProperty = source[k];
    if (!(sourceProperty instanceof Object)) {
      target[k] = sourceProperty;
      return;
    }
    if (cloneMode === undefined) {
      // Undecorated: fall back to the type's registered default clone mode, else deep clone.
      cloneMode = (<ICustomClone>sourceProperty)._defaultCloneMode ?? CloneMode.Deep;
    }

    if (cloneMode === CloneMode.Ignore) return;
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
    CloneManager._deepClone(sourceProperty, target, k, cloneMap);
  }

  /**
   * Type dispatch: how to clone is decided purely by the runtime type of
   * `sourceProperty`. `cloneMode` is forwarded to recursive calls so children
   * can re-dispatch by their own type.
   */
  private static _deepClone(
    sourceProperty: Object,
    target: Object,
    k: string | number,
    cloneMap: Map<Object, Object>
  ): void {
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
        CloneManager.cloneProperty(sourceProperty, dst, i, undefined, cloneMap);
      }
    } else {
      if (cloneMap.has(sourceProperty)) {
        target[k] = cloneMap.get(sourceProperty);
        return;
      }
      let dst = <Object>target[k];
      // Reuse same-type instance pre-allocated on target (e.g. constructor-created Vector3),
      // otherwise create a new instance from source's constructor.
      const reuseTarget = dst && dst !== sourceProperty && dst.constructor === sourceProperty.constructor;
      if (!reuseTarget) {
        dst = new (<any>sourceProperty.constructor)();
        target[k] = dst;
      }
      cloneMap.set(sourceProperty, dst);
      // Populate: copyFrom fast path for value types (Vector3, Color, Matrix, ...),
      // otherwise recurse fields respecting any decorators on the inner type.
      if ((<ICustomClone>sourceProperty).copyFrom) {
        (<ICustomClone>dst).copyFrom(<ICustomClone>sourceProperty);
      } else {
        const cloneModes = CloneManager.getCloneMode(sourceProperty.constructor);
        for (let key in sourceProperty) {
          CloneManager.cloneProperty(sourceProperty, dst, key, cloneModes[key], cloneMap);
        }
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

  static deepCloneObject(source: Object, target: Object, cloneMap: Map<Object, Object>): void {
    for (let k in source) {
      CloneManager.cloneProperty(source, target, k, CloneMode.Deep, cloneMap);
    }
  }
}
