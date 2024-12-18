import { Vector3 } from "@galacean/engine-math";

/**
 * Describes a contact point where the collision occurs.
 */
export class ContactPoint {
  /** The position of the contact point between the shapes, in world space. */
  readonly position = new Vector3();
  /** The normal of the contacting surfaces at the contact point. The normal direction points from the second shape to the first shape. */
  readonly normal = new Vector3();
  /** The impulse applied at the contact point, in world space. Divide by the simulation time step to get a force value. */
  readonly impulse = new Vector3();
  /** The separation of the shapes at the contact point.  A negative separation denotes a penetration. */
  separation: number;
}
