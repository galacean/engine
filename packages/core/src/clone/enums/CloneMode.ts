/**
 * How a value is cloned, decided by its type (see `@defaultCloneMode`).
 */
export enum CloneMode {
  /** Share the reference; a ref-counted resource is kept alive by the clone (used for assets). */
  Assignment,
  /** Recursively deep clone the value. */
  Deep,
  /** Remap an Entity / Component reference to its clone within the cloned subtree, else keep as-is. */
  Remap
}
