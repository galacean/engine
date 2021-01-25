/**
 * Defines the intersection between a plane and a bounding volume.
 */
export enum PlaneIntersectionType {
  /** There is no intersection, the bounding volume is in the back of the plane. */
  Back,
  /** There is no intersection, the bounding volume is in the front of the plane. */
  Front,
  /** The plane is intersected. */
  Intersecting
}
