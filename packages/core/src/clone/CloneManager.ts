import { CloneMode } from "./enums/CloneMode";

/**
 * Property decorator — deep clone this field, overriding the value type's default clone mode
 * (field-level decorators have the highest priority). A decorator is an explicit intent: if the
 * value can't be deep cloned (an entity reference or an asset), cloning throws rather than
 * silently falling back.
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
 * Field-level clone mode registry. Deliberately free of any engine class import: every class that
 * uses a clone decorator imports this module while it is still being defined, so pulling an
 * engine class in here (directly or through `CloneUtil`) reorders module evaluation and breaks
 * `extends` chains. The cloning itself lives in `CloneUtil`.
 */
export class CloneManager {
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
}
