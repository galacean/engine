import { CloneMode } from "./enums/CloneMode";

type LegacyPropertyKey = string | symbol;

/**
 * The public clone decorators are used by both TypeScript's legacy decorator
 * transform and preview runtimes that emit the Stage-3 decorator proposal.
 *
 * Stage-3 field decorators receive the initial value plus a context object;
 * they do not receive the prototype. Registering the mode from the field's
 * instance initializer is therefore intentional: cloning reads the source
 * instance's mode table, and the table stays non-enumerable.
 */
interface Stage3DecoratorContext {
  kind: string;
  name: LegacyPropertyKey;
  addInitializer(initializer: (this: object) => void): void;
}

function _isStage3DecoratorContext(value: unknown): value is Stage3DecoratorContext {
  return !!value && typeof value === "object" && "kind" in value && "addInitializer" in value;
}

function _registerDecoratorFieldMode(
  targetOrValue: object | undefined,
  propertyKeyOrContext: LegacyPropertyKey | Stage3DecoratorContext,
  mode: CloneMode
): void {
  if (_isStage3DecoratorContext(propertyKeyOrContext)) {
    // Clone traversal only observes own enumerable fields. A Stage-3 method or
    // accessor decorator therefore has no clone-mode effect, matching the
    // legacy behavior without trying to infer an instance target.
    if (propertyKeyOrContext.kind !== "field") return;

    propertyKeyOrContext.addInitializer(function () {
      CloneManager._registerFieldMode(this, propertyKeyOrContext.name, mode);
    });
    return;
  }

  CloneManager._registerFieldMode(targetOrValue!, propertyKeyOrContext, mode);
}

/**
 * Property decorator — deep clone this field's whole subtree, overriding the value type's default
 * clone mode (field-level decorators have the highest priority). The deep intent carries into the
 * field's members; engine-bound members keep their defaults (assets share, entity refs remap).
 * A decorator is an explicit intent: if the decorated value itself can't be deep cloned (an
 * entity reference, an asset, or a function), cloning throws rather than silently falling back.
 */
export function deepClone(target: object, propertyKey: LegacyPropertyKey): void;
export function deepClone(value: undefined, context: Stage3DecoratorContext): void;
export function deepClone(
  targetOrValue: object | undefined,
  propertyKeyOrContext: LegacyPropertyKey | Stage3DecoratorContext
): void {
  _registerDecoratorFieldMode(targetOrValue, propertyKeyOrContext, CloneMode.Deep);
}

/**
 * Property decorator — assign (share the reference) this field, overriding the value type's default clone mode.
 */
export function assignmentClone(target: object, propertyKey: LegacyPropertyKey): void;
export function assignmentClone(value: undefined, context: Stage3DecoratorContext): void;
export function assignmentClone(
  targetOrValue: object | undefined,
  propertyKeyOrContext: LegacyPropertyKey | Stage3DecoratorContext
): void {
  _registerDecoratorFieldMode(targetOrValue, propertyKeyOrContext, CloneMode.Assignment);
}

/**
 * Property decorator — ignore this field when cloning; keep the clone's own constructor-built value.
 */
export function ignoreClone(target: object, propertyKey: LegacyPropertyKey): void;
export function ignoreClone(value: undefined, context: Stage3DecoratorContext): void;
export function ignoreClone(
  targetOrValue: object | undefined,
  propertyKeyOrContext: LegacyPropertyKey | Stage3DecoratorContext
): void {
  _registerDecoratorFieldMode(targetOrValue, propertyKeyOrContext, CloneMode.Ignore);
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
  static _registerFieldMode(target: any, propertyKey: LegacyPropertyKey, mode: CloneMode): void {
    // Each class gets its own `_fieldModes`, prototypally chained to its parent's, so property
    // lookup resolves inheritance: a subclass re-decorating a field shadows the ancestor's.
    if (!Object.prototype.hasOwnProperty.call(target, "_fieldModes")) {
      Object.defineProperty(target, "_fieldModes", {
        value: Object.create(target._fieldModes ?? null),
        configurable: true
      });
    }
    target._fieldModes[propertyKey] = mode;
  }
}
