/**
 * How a field is cloned when a clone decorator overrides the built-in default for its type.
 */
export enum CloneMode {
  /** Skip — keep the clone's own constructor-built value (for runtime / transient state). */
  Ignore,
  /** Share the reference; a counted resource shared at a component's top-level slot is kept alive by the clone. */
  Assignment,
  /**
   * Recursively clone the graph structure (fresh containers/instances); each member follows its
   * own clone semantics — assets stay shared, entity refs remap, runtime state is ignored.
   */
  Deep
}
