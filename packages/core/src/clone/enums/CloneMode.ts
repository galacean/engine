/**
 * Clone mode.
 */
export enum CloneMode {
  /** Ignore clone. */
  Ignore,
  /** Assignment clone. */
  Assignment,
  /** Shallow clone. */
  Shallow,
  /** Deep clone. */
  Deep,
  /** Remap an Entity / Component reference to its clone via the identity map. */
  Remap
}

/**
 * @internal
 * Class decorator: register the default clone mode for instances of a type, applied when a field
 * holding such an instance is undecorated. Set non-enumerably on the prototype. Explicit field
 * decorators (@ignoreClone / @assignmentClone / @deepClone) take precedence over it.
 */
export function defaultCloneMode(mode: CloneMode) {
  return function (target: Function): void {
    Object.defineProperty(target.prototype, "_defaultCloneMode", { value: mode });
  };
}
