/** @internal */
export const defaultCloneModeKey = Symbol("defaultCloneMode");
const fieldCloneModesKey = Symbol("fieldCloneModes");
const symbolConstructor = Symbol as SymbolConstructor & { readonly metadata?: symbol };
const decoratorMetadataKey = symbolConstructor.metadata ?? Symbol.for("Symbol.metadata");
const resolvedFieldCloneModes = new WeakMap<Function, Readonly<Record<string, CloneMode>> | null>();

if (!symbolConstructor.metadata) {
  Object.defineProperty(symbolConstructor, "metadata", { value: decoratorMetadataKey });
}

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
): void {
  if (context.kind !== "field" || context.static || context.private || typeof context.name !== "string") {
    throw new TypeError("Clone decorators only support public instance fields with string keys.");
  }

  const metadata = context.metadata;
  if (!metadata) {
    throw new TypeError("Clone decorators require standard decorator metadata support.");
  }

  if (!Object.prototype.hasOwnProperty.call(metadata, fieldCloneModesKey)) {
    const inheritedFieldModes = metadata[fieldCloneModesKey] as Record<string, CloneMode> | undefined;
    Object.defineProperty(metadata, fieldCloneModesKey, {
      value: Object.create(inheritedFieldModes ?? null)
    });
  }
  (<Record<string, CloneMode>>metadata[fieldCloneModesKey])[context.name] = mode;
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
): void {
  registerDecoratorFieldMode(context, CloneMode.Deep);
}

/**
 * Field decorator — assign (share the reference) this field, overriding the value type's default clone mode.
 */
export function assignmentClone<This extends object, Value>(
  _value: undefined,
  context: ClassFieldDecoratorContext<This, Value>
): void {
  registerDecoratorFieldMode(context, CloneMode.Assignment);
}

/**
 * Field decorator — ignore this field when cloning; keep the clone's own constructor-built value.
 */
export function ignoreClone<This extends object, Value>(
  _value: undefined,
  context: ClassFieldDecoratorContext<This, Value>
): void {
  registerDecoratorFieldMode(context, CloneMode.Ignore);
}

/**
 * @internal
 */
export function registerDefaultCloneMode(target: { prototype: object }, mode: CloneMode): void {
  Object.defineProperty(target.prototype, defaultCloneModeKey, { value: mode });
}

/**
 * @internal
 */
export function getFieldCloneModes(target: object): Readonly<Record<string, CloneMode>> | undefined {
  const constructor = Object.getPrototypeOf(target)?.constructor as
    | (Function & Record<symbol, Record<PropertyKey, unknown>>)
    | undefined;
  return constructor ? resolveFieldCloneModes(constructor) : undefined;
}

function resolveFieldCloneModes(
  constructor: Function & Record<symbol, Record<PropertyKey, unknown>>
): Readonly<Record<string, CloneMode>> | undefined {
  const cached = resolvedFieldCloneModes.get(constructor);
  if (cached !== undefined) {
    return cached ?? undefined;
  }

  const parentConstructor = Object.getPrototypeOf(constructor);
  const parentModes =
    typeof parentConstructor === "function" && parentConstructor !== Function.prototype
      ? resolveFieldCloneModes(parentConstructor)
      : undefined;
  const metadata = Object.prototype.hasOwnProperty.call(constructor, decoratorMetadataKey)
    ? constructor[decoratorMetadataKey]
    : undefined;
  const ownModes =
    metadata && Object.prototype.hasOwnProperty.call(metadata, fieldCloneModesKey)
      ? (metadata[fieldCloneModesKey] as Record<string, CloneMode>)
      : undefined;
  const resolvedModes = ownModes ? Object.assign(Object.create(parentModes ?? null), ownModes) : parentModes;

  resolvedFieldCloneModes.set(constructor, resolvedModes ?? null);
  return resolvedModes;
}
