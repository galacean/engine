import { Vector3 } from "@galacean/engine-math";

/**
 * Interface of collision.
 */
export interface ICollision {
  /** The unique ID of the first shape in the contact pair. */
  readonly shape0Id: number;
  /** The unique ID of the second shape in the contact pair. */
  readonly shape1Id: number;
  /** Count of contact points. */
  readonly contactCount: number;

  /**
   * Write the contact point at `index` into `out`.
   * @param index - Zero-based contact index below {@link contactCount}
   * @param out - Receives contact point data; normals and impulses must point from the second shape toward the first
   */
  getContact(index: number, out: IContactPoint): void;
}

/**
 * Contact point data populated by {@link ICollision.getContact}.
 */
export interface IContactPoint {
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly impulse: Vector3;
  separation: number;
}
