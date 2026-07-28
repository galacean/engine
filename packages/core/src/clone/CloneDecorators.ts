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

interface Stage3FieldDecoratorContext {
  readonly kind: string;
  readonly name: string | symbol;
  readonly static: boolean;
  readonly private: boolean;
  addInitializer(initializer: (this: object) => void): void;
}

function isStage3FieldDecoratorContext(value: unknown): value is Stage3FieldDecoratorContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "addInitializer" in value &&
    typeof value.addInitializer === "function"
  );
}

function registerDecoratorFieldMode(
  targetOrValue: object | undefined,
  propertyKeyOrContext: string | Stage3FieldDecoratorContext,
  mode: CloneMode
): void {
  if (isStage3FieldDecoratorContext(propertyKeyOrContext)) {
    const context = propertyKeyOrContext;
    if (context.kind !== "field" || context.static || context.private || typeof context.name !== "string") {
      throw new TypeError("Clone decorators only support public instance fields with string keys.");
    }

    const { name } = context;
    const registeredPrototypes = new WeakSet<object>();
    context.addInitializer(function () {
      const prototype = Object.getPrototypeOf(this);
      if (!registeredPrototypes.has(prototype)) {
        CloneMetadata.registerFieldMode(prototype, name, mode);
        registeredPrototypes.add(prototype);
      }
    });
    return;
  }

  CloneMetadata.registerFieldMode(targetOrValue, propertyKeyOrContext, mode);
}

/**
 * Property decorator — deep clone this field's whole subtree, overriding the value type's default
 * clone mode (field-level decorators have the highest priority). The deep intent carries into
 * field-cloneable members; engine-bound and platform objects keep their defaults. A decorator is
 * an explicit intent: if the decorated value itself can't be deep cloned (an entity reference,
 * asset, function, or object with opaque internal state), cloning throws rather than falling back.
 * Field-cloned classes reproduce only their own enumerable string-keyed properties.
 */
export function deepClone(target: object, propertyKey: string): void;
export function deepClone(value: undefined, context: Stage3FieldDecoratorContext): void;
export function deepClone(
  targetOrValue: object | undefined,
  propertyKeyOrContext: string | Stage3FieldDecoratorContext
): void {
  registerDecoratorFieldMode(targetOrValue, propertyKeyOrContext, CloneMode.Deep);
}

/**
 * Property decorator — assign (share the reference) this field, overriding the value type's default clone mode.
 */
export function assignmentClone(target: object, propertyKey: string): void;
export function assignmentClone(value: undefined, context: Stage3FieldDecoratorContext): void;
export function assignmentClone(
  targetOrValue: object | undefined,
  propertyKeyOrContext: string | Stage3FieldDecoratorContext
): void {
  registerDecoratorFieldMode(targetOrValue, propertyKeyOrContext, CloneMode.Assignment);
}

/**
 * Property decorator — ignore this field when cloning; keep the clone's own constructor-built value.
 */
export function ignoreClone(target: object, propertyKey: string): void;
export function ignoreClone(value: undefined, context: Stage3FieldDecoratorContext): void;
export function ignoreClone(
  targetOrValue: object | undefined,
  propertyKeyOrContext: string | Stage3FieldDecoratorContext
): void {
  registerDecoratorFieldMode(targetOrValue, propertyKeyOrContext, CloneMode.Ignore);
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
