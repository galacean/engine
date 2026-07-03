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
 * Property decorator — deep clone this field, overriding the value type's default clone mode.
 * Field-level decorators have the highest priority.
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
 * Class decorator that sets the default clone mode for instances of the decorated type.
 *
 * When a field holds an instance of a type decorated with `@defaultCloneMode`, the clone system
 * uses the specified mode instead of the default Assignment behavior.
 *
 * Built-in defaults:
 * - Entity / Component → `CloneMode.Remap`
 * - ReferResource (Texture, Mesh, Material, etc.) → `CloneMode.Assignment`
 * - Value-semantic config objects (RenderState, ParticleModule, ColliderShape, etc.) → `CloneMode.Deep`
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
 * Opt-out model: every enumerable field is cloned unless `@ignoreClone`. How a value clones is
 * decided by the gate (`_cloneValue`): field decorator → container deep → the value type's
 * `@defaultCloneMode` → Assignment (share) fallback.
 *
 * Ref count: a component top-level slot sharing a registered resource owns one reference
 * (`_acquireSlotOwnership`); releasing it on destroy is the owning class's contract. Below the
 * top level the gate never counts — a nested class pairs its own acquisition, and setter-rebuilt
 * slots stay `@ignoreClone` so the setter is the single +1 source.
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
   * Deep clone all enumerable fields of source into target through the clone gate,
   * respecting the source type's `@ignoreClone` field decorators.
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
   * Clone gate — decides how to clone one value based on its type.
   */
  static _cloneValue(value: any, reuse: any, cloneMap: Map<object, object>, fieldMode?: CloneMode): any {
    // Functions: an explicit field decorator (@assignmentClone/@deepClone) shares the reference;
    // by default keep the clone's own binding when its slot already holds one (constructor-rebound
    // handlers), otherwise share (container elements / null-preset slots have none).
    if (typeof value === "function") {
      return fieldMode !== undefined ? value : typeof reuse === "function" ? reuse : value;
    }
    // Primitives copy by value. `typeof`, not `instanceof Object` — null-prototype objects
    // (`Object.create(null)`) and cross-realm objects have no local Object.prototype in their chain.
    if (value === null || typeof value !== "object") return value;

    // Mode priority: field decorator (highest) → container default deep → type's `@defaultCloneMode` → Assignment.
    let cloneMode = fieldMode;
    if (cloneMode === undefined) {
      cloneMode = CloneManager._isContainer(value)
        ? CloneMode.Deep
        : ((<ICustomClone>value)._defaultCloneMode ?? CloneMode.Assignment);
    } else if (cloneMode === CloneMode.Deep && (<ICustomClone>value)._defaultCloneMode === CloneMode.Remap) {
      // Error recovery, NOT a priority rule: `@deepClone` on an Entity/Component reference is an
      // unexecutable directive — deep-copying one would `new Entity()` without an engine and
      // field-walk live scene state into a corrupt detached object. Recover to the closest
      // executable semantics (remap) and warn. Every executable decorator still wins over the
      // type default at all depths.
      Logger.warn(
        `CloneManager: "${value.constructor.name}" cannot be deep cloned; @deepClone on this field falls back to remap.`
      );
      cloneMode = CloneMode.Remap;
    }

    if (cloneMode === CloneMode.Ignore) return reuse;
    if (cloneMode === CloneMode.Assignment) return value;
    if (cloneMode === CloneMode.Remap) return cloneMap.get(value) ?? value;
    return CloneManager._deepClone(value, reuse, cloneMap);
  }

  /**
   * @internal
   * Slot-ownership acquisition for a component top-level slot that shared a ref-counted resource
   * (only types explicitly registered `@defaultCloneMode(Assignment)`, i.e. the ReferResource
   * family — excludes duck-typed counters like Shader): +1 on the shared value, -1 on a replaced
   * owned preset. Releasing the acquired count on destroy is the owning class's contract.
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
   * Whether the value participates in the slot-ownership ref-count contract: only types
   * explicitly registered `@defaultCloneMode(Assignment)` (the ReferResource family) do.
   */
  private static _isCountedResource(value: any): boolean {
    return value instanceof Object && (<ICustomClone>value)._defaultCloneMode === CloneMode.Assignment;
  }

  /**
   * Container-shape test — the single classification point shared by the gate and `_deepClone`.
   * Invariant: every shape this returns true for MUST have a dedicated branch in `_deepClone`
   * (ArrayBuffer view → byte copy, Array/Map/Set → per-element, plain object → field walk).
   * `constructor === undefined` catches null-prototype objects (`Object.create(null)`) — data
   * containers just like plain objects.
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
   * Deep-clone one object graph. Cycles / shared sub-graphs dedup through the identity map,
   * which also remaps Entity/Component references nested anywhere in the graph.
   */
  private static _deepClone(value: any, reuse: any, cloneMap: Map<object, object>): any {
    const existing = cloneMap.get(value);
    if (existing) return existing;

    // Value type (Vector3, Color, Matrix, ...) — copy in place.
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

    // Object — reuse or construct, then populate all fields (opt-out) + finalize.
    // A null-prototype object (`Object.create(null)`) has no constructor: rebuild it as such.
    const ctor = <new () => object>value.constructor;
    const dst =
      reuse && reuse !== value && reuse.constructor === ctor ? reuse : ctor ? new ctor() : Object.create(null);
    cloneMap.set(value, dst);
    // Nested objects own no gate-acquired references: the slot-ownership contract covers
    // component top-level fields only. A nested class that ref-counts its resources pairs the
    // acquisition itself (`_cloneTo` +1 / destroy -1 in the same class, e.g. SpriteTransition).
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

// Built-in default clone mode for math value types. The math package cannot depend on core's
// `@defaultCloneMode`, so they are registered here instead (core → math is the normal dependency
// direction). All are value-semantic and always deep cloned.
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
