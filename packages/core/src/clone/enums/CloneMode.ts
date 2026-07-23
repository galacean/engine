/**
 * Field clone behavior.
 */
export enum CloneMode {
  /** Keep the clone's constructor-initialized value. */
  Ignore,
  /** Assign the source value directly. */
  Assignment,
  /** Deep-clone the value recursively; engine-bound members retain their default behavior. */
  Deep
}
