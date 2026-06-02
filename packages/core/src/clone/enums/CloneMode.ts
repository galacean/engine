/**
 * Clone mode.
 */
export enum CloneMode {
  /** Assignment clone. */
  Assignment,
  /** Deep clone. */
  Deep,
  /** Remap an Entity / Component reference to its clone via the identity map. */
  Remap
}
