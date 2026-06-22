/**
 * How a value is cloned, decided by its type (see `@defaultCloneMode`).
 */
export enum CloneMode {
  /** Share the reference; a ref-counted resource is kept alive by the clone. */
  Assignment,
  /** Recursively deep clone the value, producing an independent copy. */
  Deep,
  /** Remap an Entity / Component reference to its clone within the cloned subtree. */
  Remap,
  /** Skip — keep the clone's own constructor-built value (for runtime / transient state). */
  Ignore
}
