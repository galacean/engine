import { CloneMode } from "./enums/CloneMode";

/** @internal */
export const fieldModesKey = Symbol("fieldModes");

/**
 * Property decorator — deep clone this field's whole subtree, overriding the value type's default
 * clone mode (field-level decorators have the highest priority). The deep intent carries into the
 * field's members; engine-bound members keep their defaults (assets share, entity refs remap).
 * A decorator is an explicit intent: if the decorated value itself can't be deep cloned (an
 * entity reference, an asset, or a function), cloning throws rather than silently falling back.
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
 * Field-level clone mode registry. Must import no engine class, directly or transitively: every
 * class carrying a clone decorator imports this module while still being defined, and pulling a
 * class in here would reorder module evaluation and break `extends` chains. Cloning itself lives
 * in `CloneUtil`.
 */
export class CloneManager {
  /**
   * @internal
   */
  static _registerFieldMode(target: any, propertyKey: string, mode: CloneMode): void {
    // Each class gets its own field modes, prototypally chained to its parent's, so property
    // lookup resolves inheritance: a subclass re-decorating a field shadows the ancestor's.
    if (!Object.prototype.hasOwnProperty.call(target, fieldModesKey)) {
      Object.defineProperty(target, fieldModesKey, {
        value: Object.create(target[fieldModesKey] ?? null),
        configurable: true
      });
    }
    target[fieldModesKey][propertyKey] = mode;
  }
}
