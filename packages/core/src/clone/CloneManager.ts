import { IReferable } from "../asset/IReferable";
import { Logger } from "../base/Logger";
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
 * @internal
 * Clone manager. Opt-out model: every enumerable field is cloned unless `@ignoreClone`,
 * with the mode resolved by `_cloneValue`.
 *
 * Ref count: a component top-level slot sharing a registered resource owns one reference;
 * releasing it on destroy is the owning class's contract. Nested levels never count at the
 * gate — a nested class pairs its own acquisition (`_cloneTo` +1 / destroy -1).
 */
export class CloneManager {
  /**
   * Clone all enumerable fields of source into target; each field goes through the clone gate,
   * honoring field-level decorators.
   */
  static deepCloneObject(source: any, target: object, cloneMap: Map<object, object>): void {
    // Resolved once per object (a single prototype-chain walk), not once per field.
    const fieldModes = source._fieldModes;
    for (const k in source) {
      const fieldMode = fieldModes?.[k];
      if (fieldMode === CloneMode.Ignore) continue;
      target[k] = CloneManager._cloneValue(source[k], target[k], cloneMap, fieldMode);
    }
  }

  /**
   * @internal
   * Register a field-level clone mode (highest priority — overrides the built-in default decision).
   * Stamped on the class's own `_fieldModes`, prototypally chained to the parent class's — native
   * lookup resolves inheritance for free (a subclass re-decorating the same field name shadows the
   * ancestor's), no separate registry or cache to keep in sync.
   */
  static _registerFieldMode(target: any, propertyKey: string, mode: CloneMode): void {
    if (!Object.prototype.hasOwnProperty.call(target, "_fieldModes")) {
      Object.defineProperty(target, "_fieldModes", {
        value: Object.create(target._fieldModes ?? null),
        configurable: true
      });
    }
    target._fieldModes[propertyKey] = mode;
  }

  /**
   * @internal
   * Clone gate. Field decorator (highest priority) is handled inline; with no field override,
   * dispatch goes straight to `_cloneByDefault` — one pass from value to action, no intermediate
   * `CloneMode` to compute and re-switch on.
   */
  static _cloneValue(value: any, reuse: any, cloneMap: Map<object, object>, fieldMode?: CloneMode): any {
    // Explicit decorator shares the function; default keeps the clone's own rebound binding.
    if (typeof value === "function") {
      return fieldMode === undefined && typeof reuse === "function" ? reuse : value;
    }
    // `typeof`, not `instanceof` — null-prototype / cross-realm objects lack local Object.prototype.
    if (value === null || typeof value !== "object") return value;
    if (fieldMode === undefined) return CloneManager._cloneByDefault(value, reuse, cloneMap);
    if (fieldMode === CloneMode.Assignment) return value;

    // fieldMode === Deep: @deepClone is the developer's explicit intent. If the value can't be
    // deep cloned (engine-bound: Entity / Component references, or assets), that intent is a
    // mistake — throw to surface it, never silently fall back to remap / share.
    if (CloneManager._isRemapType(value)) {
      throw new Error(
        `CloneManager: @deepClone cannot deep clone "${value.constructor.name}" — Entity / Component ` +
          `references are engine-bound. Remove @deepClone to remap the reference by default.`
      );
    }
    if (CloneManager._isCountedResource(value)) {
      throw new Error(
        `CloneManager: @deepClone cannot deep clone "${value.constructor.name}" — assets are engine-bound ` +
          `and shared by reference. Remove @deepClone to share it, or copy it via the asset's own clone() API.`
      );
    }
    // Neither family — deep clone through the same dispatch the default path uses, but with
    // `forceDeep`: `@deepClone` is an explicit request, so even a class with no deep-clone default
    // (which the default path would share) is field-walked here.
    return CloneManager._cloneByDefault(value, reuse, cloneMap, true);
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
   * Decide-and-execute for a value with no explicit field mode, by type family; injected from
   * `CloneDefaults` (a module-graph sink) so the gate never imports the intrinsic classes — a
   * top-level class import here would reorder module evaluation and break `extends` chains.
   */
  static _cloneByDefault: (value: object, reuse: any, cloneMap: Map<object, object>, forceDeep?: boolean) => any;

  /**
   * @internal
   * Whether the value is an engine-bound Remap type (Entity / Component); injected from `CloneDefaults`.
   */
  static _isRemapType: (value: any) => boolean;

  /**
   * @internal
   * Counted = the ReferResource family only; injected from `CloneDefaults`.
   */
  static _isCountedResource: (value: any) => boolean;

  /**
   * @internal
   * A deep-cloned instance without a compatible preset is constructed bare; name the contract
   * when that fails instead of surfacing the constructor's raw error.
   */
  static _bareConstruct(ctor: new () => any): any {
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
