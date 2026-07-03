/**
 * How a value is cloned, decided by its type (see `@defaultCloneMode`).
 */
export enum CloneMode {
  /** Skip — keep the clone's own constructor-built value (for runtime / transient state). */
  Ignore,
  /** Share the reference; a ref-counted resource is kept alive by the clone. */
  Assignment,
  /** Remap an Entity / Component reference to its clone within the cloned subtree. */
  Remap,
  /** Recursively deep clone the value, producing an independent copy. */
  Deep
}
