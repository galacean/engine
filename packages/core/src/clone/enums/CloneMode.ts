/**
 * How a value is cloned, decided by the built-in default decision or a field decorator.
 */
export enum CloneMode {
  /** Skip — keep the clone's own constructor-built value (for runtime / transient state). */
  Ignore,
  /** Share the reference; a counted resource shared at a component's top-level slot is kept alive by the clone. */
  Assignment,
  /** Remap an Entity / Component reference to its clone within the cloned subtree. */
  Remap,
  /**
   * Recursively clone the graph structure (fresh containers/instances); each member follows its
   * own clone semantics — assets stay shared, entity refs remap, runtime state is ignored.
   */
  Deep
}
