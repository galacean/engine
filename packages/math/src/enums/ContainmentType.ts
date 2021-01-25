/**
 * Defines how the bounding volumes intersects or contain one another.
 */
export enum ContainmentType {
  /** Indicates that there is no overlap between two bounding volumes. */
  Disjoint,
  /** Indicates that one bounding volume completely contains another volume. */
  Contains,
  /** Indicates that bounding volumes partially overlap one another. */
  Intersects
}
