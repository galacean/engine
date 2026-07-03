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
 * Opt-out model: all enumerable fields of an object are cloned unless marked `@ignoreClone`.
 * HOW each field value is cloned depends on the value's runtime type (`@defaultCloneMode`):
 *   - primitive / null / undefined → assign by value.
 *   - function → keep the clone's own binding when its slot already holds one (constructor-rebound
 *     handlers), otherwise share the reference (container elements have no own slot value).
 *   - Remap (Entity / Component) → resolve to the clone via the identity map.
 *   - Assignment (ReferResource / unknown types without @defaultCloneMode) → share the reference.
 *   - Deep (@defaultCloneMode(Deep) / copyFrom types / containers) → recursively deep clone.
 *
 * Ref-count (slot-ownership contract): every COMPONENT top-level field holding an explicitly
 * registered ref-counted resource (ReferResource family) owns one reference. The gate acquires
 * it when cloning the slot (+1, and -1 on a replaced preset); the owning component's destroy
 * path MUST release it — a component that doesn't is a bug in that component. Components without
 * per-field destroy logic (Script) record acquisitions and release them on destroy. Everything
 * below the top level owns nothing at the gate: container elements and plain-object fields are
 * plain shares, and a nested class that ref-counts its resources pairs the acquisition itself
 * (`_cloneTo` +1 / destroy -1 in the same class). Slots rebuilt through setters must be
 * `@ignoreClone` so the setter is the single +1 source (e.g. `MeshRenderer.mesh`).
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
   * Deep clone all enumerable fields of source into target through the clone gate.
   */
  static deepCloneObject(source: object, target: object, cloneMap: Map<object, object>): void {
    for (const k in source) {
      target[k] = CloneManager._cloneValue(source[k], target[k], cloneMap);
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
   *
   * `refs` controls the ref-count contract for THIS slot:
   * - `undefined` — the slot does not own a count (container elements, plain-object fields).
   * - `null` — a class-instance field: an Assignment-shared ref-counted resource gains +1 here,
   *   and the owning class's destroy path releases it (implementation contract).
   * - array — same as `null`, but the acquisition is also recorded (hosts with no per-field
   *   destroy logic, i.e. Script, release the recorded refs on destroy).
   */
  static _cloneValue(
    value: any,
    reuse: any,
    cloneMap: Map<object, object>,
    fieldMode?: CloneMode,
    refs?: IReferable[] | null
  ): any {
    if (!(value instanceof Object)) return value;
    // Functions: an explicit field decorator (@assignmentClone/@deepClone) shares the reference;
    // by default keep the clone's own binding when its slot already holds one (constructor-rebound
    // handlers), otherwise share (container elements / null-preset slots have none).
    if (typeof value === "function") {
      return fieldMode !== undefined ? value : typeof reuse === "function" ? reuse : value;
    }

    // Mode priority: field decorator (highest) → container default deep → type's `@defaultCloneMode` → Assignment.
    let cloneMode = fieldMode;
    if (cloneMode === undefined) {
      cloneMode = CloneManager._isContainer(value)
        ? CloneMode.Deep
        : ((<ICustomClone>value)._defaultCloneMode ?? CloneMode.Assignment);
    } else if (cloneMode === CloneMode.Deep && (<ICustomClone>value)._defaultCloneMode === CloneMode.Remap) {
      // Entity/Component instances cannot be deep cloned (engine-bound constructors, live scene
      // state); a @deepClone-decorated reference falls back to remap for reference correctness.
      Logger.warn(
        `CloneManager: "${value.constructor.name}" cannot be deep cloned; @deepClone on this field falls back to remap.`
      );
      cloneMode = CloneMode.Remap;
    }

    if (cloneMode === CloneMode.Ignore) return reuse;
    if (cloneMode === CloneMode.Assignment) {
      // Slot-ownership contract: a class-instance field sharing an explicitly-registered
      // ref-counted resource (ReferResource family — excludes duck-typed counters like Shader)
      // owns one reference; the owning class's destroy path (or the recorded ledger) releases it.
      if (refs !== undefined && CloneManager._isCountedResource(value)) {
        if (CloneManager._isCountedResource(reuse)) {
          const presetRefCount = (<{ refCount?: number }>reuse).refCount;
          presetRefCount !== undefined &&
            presetRefCount <= 0 &&
            Logger.error(
              `CloneManager: the clone's preset ${reuse.constructor.name} holds no owned reference; ` +
                `a constructor presetting a ref-counted resource must acquire it (assign via its setter or an explicit +1).`
            );
          (<IReferable>reuse)._addReferCount(-1);
        }
        (<IReferable>value)._addReferCount(1);
        refs?.push(<IReferable>value);
      }
      return value;
    }
    if (cloneMode === CloneMode.Remap) return cloneMap.get(value) ?? value;
    return CloneManager._deepClone(value, reuse, cloneMap);
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
   */
  private static _isContainer(value: object): boolean {
    return (
      Array.isArray(value) ||
      value instanceof Map ||
      value instanceof Set ||
      ArrayBuffer.isView(value) ||
      value.constructor === Object
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
    const dst =
      reuse && reuse !== value && reuse.constructor === value.constructor ? reuse : new (<any>value.constructor)();
    cloneMap.set(value, dst);
    // Nested objects own no gate-acquired references: the slot-ownership contract covers
    // component top-level fields only. A nested class that ref-counts its resources pairs the
    // acquisition itself (`_cloneTo` +1 / destroy -1 in the same class, e.g. SpriteTransition).
    const fieldModes = CloneManager.getFieldModes(value.constructor);
    for (const key in value) {
      const fieldMode = fieldModes.get(key);
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
