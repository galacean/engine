/** @internal */
export const fieldCloneModesKey = Symbol("fieldCloneModes");

/** @internal */
export const enum FieldCloneMode {
  Ignore,
  Assignment,
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
  CloneMetadata.registerFieldMode(target, propertyKey, FieldCloneMode.Deep);
}

/**
 * Property decorator — assign (share the reference) this field, overriding the value type's default clone mode.
 */
export function assignmentClone(target: object, propertyKey: string): void {
  CloneMetadata.registerFieldMode(target, propertyKey, FieldCloneMode.Assignment);
}

/**
 * Property decorator — ignore this field when cloning; keep the clone's own constructor-built value.
 */
export function ignoreClone(target: object, propertyKey: string): void {
  CloneMetadata.registerFieldMode(target, propertyKey, FieldCloneMode.Ignore);
}

class CloneMetadata {
  static registerFieldMode(target: any, propertyKey: string, mode: FieldCloneMode): void {
    if (!Object.prototype.hasOwnProperty.call(target, fieldCloneModesKey)) {
      Object.defineProperty(target, fieldCloneModesKey, {
        value: Object.create(target[fieldCloneModesKey] ?? null),
        configurable: true
      });
    }
    target[fieldCloneModesKey][propertyKey] = mode;
  }
}
