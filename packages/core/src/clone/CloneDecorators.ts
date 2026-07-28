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

function registerDecoratorFieldMode<This extends object, Value>(
  context: ClassFieldDecoratorContext<This, Value>,
  mode: CloneMode
): (this: This, value: Value) => Value {
  if (context.kind !== "field" || context.static || context.private || typeof context.name !== "string") {
    throw new TypeError("Clone decorators only support public instance fields with string keys.");
  }

  const { name } = context;
  const registeredPrototypes = new WeakSet<object>();
  return function (value) {
    const prototype = Object.getPrototypeOf(this);
    if (!registeredPrototypes.has(prototype)) {
      CloneMetadata.registerFieldMode(prototype, name, mode);
      registeredPrototypes.add(prototype);
    }
    return value;
  };
}

/**
 * Field decorator — deep clone this field's whole subtree, overriding the value type's default
 * clone mode (field-level decorators have the highest priority). The deep intent carries into
 * field-cloneable members; engine-bound and platform objects keep their defaults. A decorator is
 * an explicit intent: if the decorated value itself can't be deep cloned (an entity reference,
 * asset, function, or object with opaque internal state), cloning throws rather than falling back.
 * Field-cloned classes reproduce only their own enumerable string-keyed properties.
 */
export function deepClone<This extends object, Value>(
  _value: undefined,
  context: ClassFieldDecoratorContext<This, Value>
): (this: This, value: Value) => Value {
  return registerDecoratorFieldMode(context, CloneMode.Deep);
}

/**
 * Field decorator — assign (share the reference) this field, overriding the value type's default clone mode.
 */
export function assignmentClone<This extends object, Value>(
  _value: undefined,
  context: ClassFieldDecoratorContext<This, Value>
): (this: This, value: Value) => Value {
  return registerDecoratorFieldMode(context, CloneMode.Assignment);
}

/**
 * Field decorator — ignore this field when cloning; keep the clone's own constructor-built value.
 */
export function ignoreClone<This extends object, Value>(
  _value: undefined,
  context: ClassFieldDecoratorContext<This, Value>
): (this: This, value: Value) => Value {
  return registerDecoratorFieldMode(context, CloneMode.Ignore);
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
