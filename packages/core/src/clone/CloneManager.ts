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
      return fieldMode !== undefined ? value : typeof reuse === "function" ? reuse : value;
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
   * A component top-level slot that shared a counted resource owns one reference:
   * +1 on the shared value, -1 on a replaced owned preset; destroy releases it (class contract).
   */
  static _acquireSlotOwnership(value: any, preset: any): void {
    if (!CloneManager._isCountedResource(value)) return;
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
    (<IReferable>value)._addReferCount(1);
  }

  /**
   * Only explicitly registered Assignment types (ReferResource family) participate in
   * ref counting — excludes duck-typed counters like Shader.
   */
  private static _isCountedResource(value: any): boolean {
    return value instanceof Object && (<ICustomClone>value)._defaultCloneMode === CloneMode.Assignment;
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

    // Value type (Vector3, Color, Matrix, ...) — copyFrom, reusing the preset when compatible.
    if ((<ICustomClone>value).copyFrom) {
      const dst =
        reuse && reuse !== value && reuse.constructor === value.constructor ? reuse : new (<any>value.constructor)();
      cloneMap.set(value, dst);
      (<ICustomClone>dst).copyFrom(<ICustomClone>value);
      (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst, cloneMap);
      return dst;
    }

    // ArrayBuffer views — byte copy (covers every view `_isContainer` routes here, incl. DataView).
    if (ArrayBuffer.isView(value)) {
      if (value instanceof DataView) {
        const src = <DataView>value;
        if (reuse instanceof DataView && reuse.byteLength === src.byteLength) {
          new Uint8Array(reuse.buffer, reuse.byteOffset, reuse.byteLength).set(
            new Uint8Array(src.buffer, src.byteOffset, src.byteLength)
          );
          return reuse;
        }
        return new DataView(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength));
      }
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

    // Object — reuse or construct (null-prototype objects have no ctor: rebuild as such),
    // then populate all fields (opt-out) and run its `_cloneTo` hook.
    const ctor = <new () => object>value.constructor;
    const dst =
      reuse && reuse !== value && reuse.constructor === ctor ? reuse : ctor ? new ctor() : Object.create(null);
    cloneMap.set(value, dst);
    const fieldModes = ctor ? CloneManager.getFieldModes(ctor) : null;
    for (const key in value) {
      const fieldMode = fieldModes?.get(key);
      if (fieldMode === CloneMode.Ignore) continue;
      dst[key] = CloneManager._cloneValue(value[key], dst[key], cloneMap, fieldMode);
    }
    (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst, cloneMap);
    return dst;
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
