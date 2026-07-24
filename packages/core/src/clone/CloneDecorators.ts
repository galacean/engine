/** @internal */
export const defaultCloneModeKey = Symbol("defaultCloneMode");
/** @internal */
export const fieldCloneModesKey = Symbol("fieldCloneModes");

/**
 * @internal
 */
export const enum CloneMode {
  Ignore,
  Assignment,
  Remap,
  Copy,
  Deep
}

/**
 * Property decorator — deep clone this field's whole subtree, overriding the value type's default
 * clone mode (field-level decorators have the highest priority). The deep intent carries into
 * field-cloneable members; engine-bound and platform objects keep their defaults. A decorator is
 * an explicit intent: if the decorated value itself can't be deep cloned (an entity reference,
 * asset, function, or object with opaque internal state), cloning throws rather than falling back.
 */
export function deepClone(target: object, propertyKey: string): void {
  CloneMetadata.registerFieldMode(target, propertyKey, CloneMode.Deep);
}

/**
 * Property decorator — assign (share the reference) this field, overriding the value type's default clone mode.
 */
export function assignmentClone(target: object, propertyKey: string): void {
  CloneMetadata.registerFieldMode(target, propertyKey, CloneMode.Assignment);
}

/**
 * Property decorator — ignore this field when cloning; keep the clone's own constructor-built value.
 */
export function ignoreClone(target: object, propertyKey: string): void {
  CloneMetadata.registerFieldMode(target, propertyKey, CloneMode.Ignore);
}

/**
 * @internal
 */
export function registerDefaultCloneMode(target: { prototype: object }, mode: CloneMode): void {
  Object.defineProperty(target.prototype, defaultCloneModeKey, { value: mode });
}

class CloneMetadata {
  static registerFieldMode(target: any, propertyKey: string, mode: CloneMode): void {
    if (!Object.prototype.hasOwnProperty.call(target, fieldCloneModesKey)) {
      Object.defineProperty(target, fieldCloneModesKey, {
        value: Object.create(target[fieldCloneModesKey] ?? null),
        configurable: true
      });
    }
    target[fieldCloneModesKey][propertyKey] = mode;
  }
}
