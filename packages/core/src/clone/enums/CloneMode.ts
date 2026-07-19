/**
 * How a field is cloned when a clone decorator overrides the built-in default for its type.
 */
export enum CloneMode {
  /** Skip — keep the clone's own constructor-built value (for runtime / transient state). */
  Ignore,
  /** Share the reference; a counted resource shared at a component's top-level slot is kept alive by the clone. */
  Assignment,
  /**
   * Deep clone the whole subtree (fresh containers/instances, the intent carries into members);
   * engine-bound members keep their defaults — assets stay shared, entity refs remap, runtime
   * state keeps the clone's own.
   */
  Deep
}
