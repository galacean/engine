import {
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  Color,
  Matrix,
  Matrix3x3,
  Plane,
  Quaternion,
  Ray,
  Rect,
  SphericalHarmonics3,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine-math";
import { IReferable } from "../asset/IReferable";
import { TypedArray } from "../base/Constant";
import { Logger } from "../base/Logger";
import { ICustomClone } from "./ComponentCloner";
import { CloneMode } from "./enums/CloneMode";

/**
 * Property decorator — deep clone this field, overriding the value type's default clone mode
 * (field-level decorators have the highest priority). Engine-bound values (entities / assets)
 * cannot be deep cloned — they fall back to remap / share with a warning.
 */
export function deepClone(target: object, propertyKey: string): void {
  CloneManager._registerFieldMode(target, propertyKey, CloneMode.Deep);
}

/**
 * Property decorator — assign (share the reference) this field, overriding the value type's default clone mode.
 */
export function assignmentClone(target: object, propertyKey: string): void {
  CloneManager._registerFieldMode(target, propertyKey, CloneMode.Assignment);
}

/**
 * Property decorator — ignore this field when cloning; keep the clone's own constructor-built value.
 */
export function ignoreClone(target: object, propertyKey: string): void {
  CloneManager._registerFieldMode(target, propertyKey, CloneMode.Ignore);
}

/**
 * Class decorator — the default clone mode for instances of the decorated type
 * (unregistered non-container types fall back to Assignment).
 * A type registered `Deep` must construct without arguments: the gate creates preset-less
 * instances bare and then populates every field.
 * @param mode - The clone mode applied to instances of the decorated type
 */
export function defaultCloneMode(mode: CloneMode) {
  return function (target: Function): void {
    Object.defineProperty(target.prototype, "_defaultCloneMode", { value: mode });
  };
}

/**
 * @internal
 * Clone manager. Opt-out model: every enumerable field is cloned unless `@ignoreClone`,
 * with the mode resolved by `_cloneValue`.
 *
 * Ref count: a component top-level slot sharing a registered resource owns one reference;
 * releasing it on destroy is the owning class's contract. Nested levels never count at the
 * gate — a nested class pairs its own acquisition (`_cloneTo` +1 / destroy -1).
 */
export class CloneManager {
  /** @internal Own field-level clone modes per class (excluding inherited), from `@deepClone`/`@assignmentClone`/`@ignoreClone`. */
  static _subFieldModeMap = new Map<object, Map<string, CloneMode>>();
  /** @internal Flattened field-level clone modes per class (across the prototype chain), cached. */
  static _fieldModeMap = new Map<object, Map<string, CloneMode>>();

  private static _objectType = Object.getPrototypeOf(Object);

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

  /**
   * Clone all enumerable fields of source into target; each field goes through the clone gate,
   * honoring field-level decorators.
   */
  static deepCloneObject(source: object, target: object, cloneMap: Map<object, object>): void {
    const ctor = (<{ constructor?: Function }>source).constructor;
    const fieldModes = ctor ? CloneManager.getFieldModes(ctor) : null;
    for (const k in source) {
      const fieldMode = fieldModes?.get(k);
      if (fieldMode === CloneMode.Ignore) continue;
      target[k] = CloneManager._cloneValue(source[k], target[k], cloneMap, fieldMode);
    }
  }

  /**
   * @internal
   * Register a field-level clone mode (highest priority — overrides the value type's `@defaultCloneMode`).
   */
  static _registerFieldMode(target: object, propertyKey: string, mode: CloneMode): void {
    let fields = CloneManager._subFieldModeMap.get(target.constructor);
    if (!fields) {
      fields = new Map<string, CloneMode>();
      CloneManager._subFieldModeMap.set(target.constructor, fields);
    }
    fields.set(propertyKey, mode);
    CloneManager._fieldModeMap.clear();
  }

  /**
   * @internal
   * Clone gate — resolves the effective clone mode for one value and executes it.
   */
  static _cloneValue(value: any, reuse: any, cloneMap: Map<object, object>, fieldMode?: CloneMode): any {
    // Explicit decorator shares the function; default keeps the clone's own rebound binding.
    if (typeof value === "function") {
      return fieldMode === undefined && typeof reuse === "function" ? reuse : value;
    }
    // `typeof`, not `instanceof` — null-prototype / cross-realm objects lack local Object.prototype.
    if (value === null || typeof value !== "object") return value;

    // Mode priority: field decorator (highest) → container default deep → type's `@defaultCloneMode` → Assignment.
    let cloneMode = fieldMode;
    if (cloneMode === undefined) {
      cloneMode = CloneManager._isContainer(value)
        ? CloneMode.Deep
        : ((<ICustomClone>value)._defaultCloneMode ?? CloneMode.Assignment);
    } else if (cloneMode === CloneMode.Deep) {
      // Error recovery (not a priority rule): engine-bound instances can't be deep cloned —
      // recover to the type's executable mode (remap / share) and warn.
      const typeDefault = (<ICustomClone>value)._defaultCloneMode;
      if (typeDefault === CloneMode.Remap) {
        Logger.warn(
          `CloneManager: "${value.constructor.name}" cannot be deep cloned; @deepClone on this field falls back to remap.`
        );
        cloneMode = CloneMode.Remap;
      } else if (typeDefault === CloneMode.Assignment) {
        Logger.warn(
          `CloneManager: "${value.constructor.name}" is an engine-bound asset and cannot be deep cloned; ` +
            `@deepClone on this field falls back to sharing (use the asset's own clone() API to copy it).`
        );
        cloneMode = CloneMode.Assignment;
      }
    }

    if (cloneMode === CloneMode.Ignore) return reuse;
    if (cloneMode === CloneMode.Assignment) return value;
    if (cloneMode === CloneMode.Remap) return cloneMap.get(value) ?? value;
    return CloneManager._deepClone(value, reuse, cloneMap);
  }

  /**
   * @internal
   * Settle a slot's counted ownership after the gate wrote it: an unchanged slot keeps its
   * account, a displaced owned counted preset releases one reference, and a slot sharing the
   * source's counted value acquires one. Destroy releases the slot (class contract).
   */
  static _transferSlotOwnership(cloned: any, sourceValue: any, preset: any): void {
    // Slot content unchanged (Ignore kept / value type copied in place / function reused).
    if (cloned === preset) return;
    if (CloneManager._isCountedResource(preset)) {
      const presetRefCount = (<{ refCount?: number }>preset).refCount;
      presetRefCount !== undefined &&
        presetRefCount <= 0 &&
        Logger.error(
          `CloneManager: the clone's preset ${preset.constructor.name} holds no owned reference; ` +
            `a constructor presetting a ref-counted resource must acquire it (assign via its setter or an explicit +1).`
        );
      (<IReferable>preset)._addReferCount(-1);
    }
    // `cloned === sourceValue` ⇔ the slot shared the source value (only the Assignment path
    // returns a registered resource as-is), so it owns one reference.
    if (cloned === sourceValue && CloneManager._isCountedResource(cloned)) {
      (<IReferable>cloned)._addReferCount(1);
    }
  }

  /**
   * @internal
   * Whether the value is an engine-bound Remap type (Entity / Component).
   */
  static _isRemapType(value: any): boolean {
    return value instanceof Object && (<ICustomClone>value)._defaultCloneMode === CloneMode.Remap;
  }

  /**
   * Counted = registered Assignment (the ReferResource family) AND implementing the counting
   * API — a user type registered Assignment without `_addReferCount` is a plain share;
   * duck-typed counters that never registered (Shader) stay excluded.
   */
  private static _isCountedResource(value: any): boolean {
    return (
      value instanceof Object &&
      (<ICustomClone>value)._defaultCloneMode === CloneMode.Assignment &&
      typeof (<IReferable>value)._addReferCount === "function"
    );
  }

  /**
   * The single container classification point. Invariant: every shape returning true MUST have
   * a dedicated `_deepClone` branch. `constructor === undefined` = null-prototype objects.
   */
  private static _isContainer(value: object): boolean {
    return (
      Array.isArray(value) ||
      value instanceof Map ||
      value instanceof Set ||
      ArrayBuffer.isView(value) ||
      value.constructor === Object ||
      value.constructor === undefined
    );
  }

  /**
   * Clone one object graph: the structure is fresh, while every member re-enters the gate and
   * follows its own semantics. Cycles / shared sub-graphs dedup through the identity map.
   */
  private static _deepClone(value: any, reuse: any, cloneMap: Map<object, object>): any {
    const existing = cloneMap.get(value);
    if (existing) return existing;

    // ArrayBuffer views — byte copy (covers every view `_isContainer` routes here, incl. DataView).
    if (ArrayBuffer.isView(value)) {
      let dst: ArrayBufferView;
      if (value instanceof DataView) {
        const src = <DataView>value;
        if (reuse instanceof DataView && reuse !== value && reuse.byteLength === src.byteLength) {
          new Uint8Array(reuse.buffer, reuse.byteOffset, reuse.byteLength).set(
            new Uint8Array(src.buffer, src.byteOffset, src.byteLength)
          );
          dst = reuse;
        } else {
          dst = new DataView(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength));
        }
      } else {
        const src = <TypedArray>value;
        if (
          reuse &&
          reuse !== value &&
          reuse.constructor === src.constructor &&
          (<TypedArray>reuse).length === src.length
        ) {
          (<TypedArray>reuse).set(src);
          dst = reuse;
        } else {
          dst = src.slice();
        }
      }
      cloneMap.set(value, dst);
      return dst;
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
      for (const entry of value) {
        dst.set(
          CloneManager._cloneValue(entry[0], undefined, cloneMap),
          CloneManager._cloneValue(entry[1], undefined, cloneMap)
        );
      }
      return dst;
    }

    // Set
    if (value instanceof Set) {
      const dst = new Set<any>();
      cloneMap.set(value, dst);
      for (const v of value) {
        dst.add(CloneManager._cloneValue(v, undefined, cloneMap));
      }
      return dst;
    }

    const ctor = <any>value.constructor;
    // Compatible reuse: a distinct instance of the exact same type (null-prototype matches null-prototype).
    const reusable = reuse && reuse !== value && reuse.constructor === ctor ? reuse : null;

    // Value type (Vector3, Color, Matrix, ...) — a class instance carrying a callable copyFrom.
    // Plain / null-prototype objects never take this branch, even when a `copyFrom` field rides in the data.
    if (ctor && ctor !== Object && typeof (<ICustomClone>value).copyFrom === "function") {
      const dst = <ICustomClone>(reusable ?? CloneManager._bareConstruct(ctor));
      cloneMap.set(value, dst);
      dst.copyFrom(<ICustomClone>value);
      (<ICustomClone>value)._cloneTo?.(dst, cloneMap);
      return dst;
    }

    // Object — reuse or construct (null-prototype objects have no ctor: rebuild as such),
    // then populate all fields (opt-out) and run its `_cloneTo` hook.
    const dst = reusable ?? (ctor ? CloneManager._bareConstruct(ctor) : Object.create(null));
    cloneMap.set(value, dst);
    CloneManager.deepCloneObject(value, dst, cloneMap);
    (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst, cloneMap);
    return dst;
  }

  /**
   * A deep-cloned instance without a compatible preset is constructed bare; name the contract
   * when that fails instead of surfacing the constructor's raw error.
   */
  private static _bareConstruct(ctor: new () => any): any {
    try {
      return new ctor();
    } catch (e) {
      throw new Error(
        `CloneManager: failed to bare-construct "${ctor.name}" — a type cloned deep must support ` +
          `argument-less construction (the gate creates preset-less instances bare, then populates fields). ` +
          `Cause: ${e}`
      );
    }
  }
}

// Math value types are always deep cloned; registered here because math cannot depend on core.
const _markDeep = defaultCloneMode(CloneMode.Deep);
[
  Ray,
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
